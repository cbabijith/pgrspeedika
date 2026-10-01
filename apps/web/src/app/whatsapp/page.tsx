"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { CheckCircle2, MessageCircle, ShoppingBasket } from "lucide-react";
import { z } from "zod";
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Money, Skeleton, Textarea } from "@pgrs/ui";
import { formatINR, type WhatsAppOrderResult } from "@pgrs/contracts";
import { api, unwrap } from "@/lib/api";
import { useCart } from "@/lib/hooks";
import { useCartStore } from "@/store/cart";
import { useUIStore } from "@/store/ui";

const guestFormSchema = z.object({
  name: z.string().min(2, "Your name is required").max(80),
  phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number"),
  line1: z.string().min(4, "House / street is required").max(200),
  landmark: z.string().max(120),
  pincode: z.string().regex(/^[1-9]\d{5}$/, "We serve 670001, 670007, 670012, 671314"),
  note: z.string().max(500),
});
type GuestFormValues = z.infer<typeof guestFormSchema>;

/** Guest WhatsApp ordering: no account, order lands in admin + shop's WhatsApp. */
export default function WhatsAppOrderPage() {
  const lang = useUIStore((s) => s.lang);
  const t = (en: string, ml: string) => (lang === "en" ? en : ml);
  const clearCart = useCartStore((s) => s.clear);
  const { cart } = useCart(null);
  const [placed, setPlaced] = useState<WhatsAppOrderResult | null>(null);
  const [autoOpened, setAutoOpened] = useState(false);

  const shop = useQuery({
    queryKey: ["whatsapp-shop"],
    queryFn: () =>
      unwrap<{ whatsapp: string; nextSlot: { slotId: string; date: string; labelEn: string } | null }>(
        api.api.whatsapp.shop.$get({ query: {} }),
      ),
  });

  // Prefill from a previous WhatsApp order (details saved by phone).
  const form = useForm<GuestFormValues>({
    resolver: zodResolver(guestFormSchema),
    defaultValues: { name: "", phone: "", line1: "", landmark: "", pincode: "", note: "" },
  });
  const phoneValue = form.watch("phone");

  const saved = useQuery({
    queryKey: ["whatsapp-customer", phoneValue],
    enabled: /^[6-9]\d{9}$/.test(phoneValue),
    queryFn: () =>
      unwrap<{
        name: string;
        addresses: Array<{ line1: string; landmark: string | null; pincode: string; city: string }> | null;
      }>(api.api.whatsapp.customer.$get({ query: { phone: `+91${phoneValue}` } })),
  });

  useEffect(() => {
    const data = saved.data;
    if (!data || form.getValues("line1")) return;
    form.setValue("name", data.name, { shouldValidate: false });
    const first = data.addresses?.[0];
    if (first) {
      form.setValue("line1", first.line1, { shouldValidate: false });
      form.setValue("landmark", first.landmark ?? "", { shouldValidate: false });
      form.setValue("pincode", first.pincode, { shouldValidate: false });
    }
  }, [saved.data, form]);

  const place = useMutation({
    mutationFn: async (values: GuestFormValues) => {
      if (!cart || cart.items.length === 0) throw new Error(t("Your cart is empty", "കൊട്ട ശൂന്യമാണ്"));
      return unwrap<WhatsAppOrderResult>(
        api.api.whatsapp.order.$post({
          json: {
            items: cart.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
            customer: {
              name: values.name,
              phone: `+91${values.phone.replace(/\D/g, "")}`,
              line1: values.line1,
              landmark: values.landmark || null,
              pincode: values.pincode,
              city: "Kannur",
            },
            slotId: shop.data?.nextSlot?.slotId,
            note: values.note || null,
          } as never,
        }),
      );
    },
    onSuccess: (result) => {
      setPlaced(result);
      clearCart();
      toast.success(t(`Order ${result.orderNumber} placed!`, `ഓർഡർ ${result.orderNumber} സ്ഥിരീകരിച്ചു!`));
      // Open WhatsApp with the full order pre-filled for the customer to send.
      if (!autoOpened) {
        window.open(result.whatsappLink, "_blank", "noopener");
        setAutoOpened(true);
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const totals = cart?.totals;
  const canOrder = cart != null && cart.items.length > 0;

  if (placed) {
    return (
      <div className="container-page max-w-xl py-10">
        <Card className="space-y-4 p-6 text-center">
          <CheckCircle2 className="mx-auto h-14 w-14 text-primary" aria-hidden />
          <h1 className="text-xl font-extrabold text-ink">
            {t(`Order ${placed.orderNumber} placed!`, `ഓർഡർ ${placed.orderNumber} സ്ഥിരീകരിച്ചു!`)}
          </h1>
          <p className="text-sm text-muted">
            {t(
              "The shop received it in the admin panel, and here is the same order on WhatsApp — just press send so we have it in chat too.",
              "കട അഡ്മിൻ പാനലിൽ ഓർഡർ ലഭിച്ചു; WhatsApp-ലും അയയ്ക്കാൻ താഴെ അമരുക.",
            )}
          </p>
          <ul className="divide-y divide-line text-left text-sm">
            {placed.items.map((i, idx) => (
              <li key={idx} className="flex justify-between py-2">
                <span>
                  {lang === "en" ? i.nameEn : i.nameMl} × {i.quantity} {i.unitLabelEn}
                </span>
                <Money paise={i.lineTotalPaise} className="font-bold" />
              </li>
            ))}
          </ul>
          <div className="flex justify-between border-t border-line pt-3 text-base">
            <span className="font-extrabold">{t("Total (cash on delivery)", "ആകെ (COD)")}</span>
            <Money paise={placed.grandTotalPaise} className="font-extrabold text-primary-700" />
          </div>
          <p className="text-xs text-muted">
            🚚 {placed.slotLabelEn} · {placed.slotDate} ·{" "}
            {t("We saved your details for next time", "അടുത്ത തവണയ്ക്ക് വിവരങ്ങൾ സേവ് ചെയ്തിട്ടുണ്ട്")}
          </p>
          <a href={placed.whatsappLink} target="_blank" rel="noreferrer">
            <Button size="lg" className="w-full">
              <MessageCircle className="h-5 w-5" aria-hidden />
              {t("Send this order on WhatsApp", "WhatsApp-ൽ ഓർഡർ അയയ്ക്കുക")}
            </Button>
          </a>
          <a href="/" className="block text-xs font-semibold text-primary-700 underline">
            {t("Back to the shop", "കടയിലേക്ക് മടങ്ങുക")}
          </a>
        </Card>
      </div>
    );
  }

  return (
    <div className="container-page max-w-2xl space-y-5 py-8">
      <header className="space-y-1 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary-surface text-primary-700">
          <MessageCircle className="h-7 w-7" aria-hidden />
        </span>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">
          {t("Order on WhatsApp", "WhatsApp-ൽ ഓർഡർ ചെയ്യുക")}
        </h1>
        <p className="text-sm text-muted">
          {t(
            "No account needed. We place the order in the shop system and send it to the shop's WhatsApp — pay cash on delivery.",
            "അക്കൗണ്ട് വേണ്ട. ഓർഡർ കടയുടെ സിസ്റ്റത്തിലും WhatsApp-ലും എത്തും — പണം ഡെലിവറി സമയത്ത്.",
          )}
        </p>
        {shop.data?.whatsapp ? (
          <p className="text-xs font-bold text-primary-700">
            💬 {shop.data.whatsapp}
            {shop.data.nextSlot
              ? ` · ${t("next slot", "അടുത്ത സ്ലോട്ട്")}: ${shop.data.nextSlot.labelEn}`
              : ""}
          </p>
        ) : null}
      </header>

      {!canOrder ? (
        <EmptyState
          icon={<ShoppingBasket className="h-10 w-10" />}
          title={t("Add items to your basket first", "ആദ്യം ഇനങ്ങൾ ചേർക്കുക")}
          description={t(
            "Browse the shop, tap + on what you need, then come back here.",
            "ഇനങ്ങൾ ചേർത്ത ശേഷം ഇവിടെ വരിക.",
          )}
          action={
            <Button onClick={() => (window.location.href = "/")}>
              {t("Browse products", "ഇനങ്ങൾ കാണുക")}
            </Button>
          }
        />
      ) : (
        <>
          <Card className="p-4">
            <h2 className="mb-2 text-sm font-bold text-ink">
              {t("Your basket", "നിങ്ങളുടെ കൊട്ട")} ({cart?.itemCount ?? 0})
            </h2>
            {cart == null ? (
              <Skeleton className="h-16 w-full" />
            ) : (
              <>
                <ul className="divide-y divide-line text-sm">
                  {cart.items.map((line) => (
                    <li key={line.variantId} className="flex justify-between py-1.5">
                      <span>
                        {lang === "en" ? line.nameEn : line.nameMl} × {line.quantity}{" "}
                        <span className="text-xs text-muted">({line.unitLabelEn})</span>
                      </span>
                      <Money paise={line.lineTotalPaise} className="font-semibold" />
                    </li>
                  ))}
                </ul>
                <div className="mt-2 flex justify-between border-t border-line pt-2 text-sm">
                  <span className="text-muted">
                    {t("Subtotal", "ഉപമൊത്തം")}
                    {totals?.minOrderPaise != null
                      ? ` · ${t("min", "മിനിമം")} ${formatINR(totals.minOrderPaise)}`
                      : ""}
                  </span>
                  <Money paise={totals?.subtotalPaise ?? 0} className="font-extrabold text-primary-700" />
                </div>
              </>
            )}
          </Card>

          <Card className="p-4">
            <h2 className="mb-3 text-sm font-bold text-ink">{t("Delivery details", "ഡെലിവറി വിവരങ്ങൾ")}</h2>
            {saved.data ? (
              <Alert tone="success">
                {t(
                  `Welcome back${saved.data.name ? `, ${saved.data.name}` : ""} — we filled your saved address.`,
                  `വീണ്ടും വന്നതിന് നന്ദി — സേവ് ചെയ്ത വിലാസം നിറച്ചു.`,
                )}
              </Alert>
            ) : null}
            <form
              className="mt-2 grid gap-3 sm:grid-cols-2"
              onSubmit={form.handleSubmit((values) => place.mutate(values))}
              noValidate
            >
              <Field label={t("Your name", "പേര്")} error={form.formState.errors.name?.message}>
                <Input id="wa-name" {...form.register("name")} />
              </Field>
              <Field
                label={t("WhatsApp number", "WhatsApp നമ്പർ")}
                error={form.formState.errors.phone?.message}
              >
                <Input
                  id="wa-phone"
                  inputMode="numeric"
                  placeholder="98765 43210"
                  {...form.register("phone")}
                />
              </Field>
              <Field
                label={t("House / street", "വീട് / തെരുവ്")}
                error={form.formState.errors.line1?.message}
                className="sm:col-span-2"
              >
                <Textarea id="wa-line1" className="min-h-16" {...form.register("line1")} />
              </Field>
              <Field label={t("Landmark", "ലാൻഡ്മാർക്ക്")} error={form.formState.errors.landmark?.message}>
                <Input id="wa-landmark" {...form.register("landmark")} />
              </Field>
              <Field
                label={t("Pincode", "പിൻകോഡ്")}
                hint="670001, 670007, 670012, 671314"
                error={form.formState.errors.pincode?.message}
              >
                <Input id="wa-pincode" inputMode="numeric" {...form.register("pincode")} />
              </Field>
              <Field
                label={t("Note for the shop (optional)", "കടയ്ക്കുള്ള കുറിപ്പ്")}
                className="sm:col-span-2"
              >
                <Textarea id="wa-note" className="min-h-14" {...form.register("note")} />
              </Field>
              <div className="sm:col-span-2">
                <Badge tone="amber">{t("Cash on delivery · slot auto-picked", "COD · സ്ലോട്ട് ഓട്ടോ")}</Badge>
              </div>
              <div className="sm:col-span-2">
                <Button type="submit" size="lg" className="w-full" loading={place.isPending}>
                  <MessageCircle className="h-5 w-5" aria-hidden />
                  {t("Place order & open WhatsApp", "ഓർഡർ ചെയ്ത് WhatsApp തുറക്കുക")}
                </Button>
              </div>
            </form>
          </Card>
        </>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, MessageCircle } from "lucide-react";
import { z } from "zod";
import { Alert, Button, Card, EmptyState, Field, Input, Money, Select, Textarea } from "@pgrs/ui";
import { formatINR, type SlotAvailability, type WhatsAppOrderResult } from "@pgrs/contracts";
import { api, unwrap } from "@/lib/api";
import { useCart } from "@/lib/hooks";
import { useCartStore } from "@/store/cart";
import { useUIStore } from "@/store/ui";
import { UnavailableCartNotice } from "./unavailable-cart-notice";

const formSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(80),
  phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number"),
  line1: z.string().trim().min(4, "Enter your house and street").max(200),
  landmark: z.string().max(120),
  pincode: z.string().regex(/^[1-9]\d{5}$/, "Enter a valid 6-digit pincode"),
  city: z.string().trim().min(2, "Enter your town or city").max(60),
  note: z.string().max(500),
});
type FormValues = z.infer<typeof formSchema>;
const defaults: FormValues = {
  name: "",
  phone: "",
  line1: "",
  landmark: "",
  pincode: "",
  city: "Kottayam",
  note: "",
};
export type GuestReceipt = {
  orderId: string;
  orderNumber: string;
  guestToken: string;
  grandTotalPaise: number;
};

/** One checkout for guest COD and WhatsApp orders, with current server prices. */
export function GuestCheckout({ whatsapp = false }: { whatsapp?: boolean }) {
  const lang = useUIStore((s) => s.lang);
  const t = (en: string, ml: string) => (lang === "en" ? en : ml);
  const form = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: defaults });
  const pincode = form.watch("pincode");
  const { cart, isLoading, error, signedIn } = useCart(/^[1-9]\d{5}$/.test(pincode) ? pincode : null);
  const localLines = useCartStore((s) => s.lines);
  const clear = useCartStore((s) => s.clear);
  const queryClient = useQueryClient();
  const [placed, setPlaced] = useState<WhatsAppOrderResult | null>(null);
  const [slotKey, setSlotKey] = useState("");
  const [remember, setRemember] = useState(true);
  const [key, setKey] = useState("");
  const [dates] = useState(() =>
    [0, 1].map((offset) =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(Date.now() + offset * 86400000)),
    ),
  );

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("pgrs-guest-details") ?? "null");
      if (saved) form.reset({ ...defaults, ...saved, note: "" });
      let attempt = sessionStorage.getItem("pgrs-checkout-key");
      if (!attempt) {
        attempt = `guest-${crypto.randomUUID()}`;
        sessionStorage.setItem("pgrs-checkout-key", attempt);
      }
      setKey(attempt);
    } catch {
      setKey(`guest-${crypto.randomUUID()}`);
    }
  }, [form]);

  const zones = useQuery({
    queryKey: ["delivery-zones"],
    queryFn: () => unwrap<Array<{ pincode: string; areaNameEn: string }>>(api.api.delivery.zones.$get()),
  });
  const slots = useQuery({
    queryKey: ["guest-slots", dates],
    refetchOnWindowFocus: true,
    queryFn: async () =>
      (
        await Promise.all(
          dates.map((date) => unwrap<SlotAvailability[]>(api.api.delivery.slots.$get({ query: { date } }))),
        )
      ).flat(),
  });
  const shop = useQuery({
    queryKey: ["whatsapp-shop"],
    enabled: whatsapp,
    queryFn: () => unwrap<{ whatsapp: string }>(api.api.whatsapp.shop.$get()),
  });
  const options = (slots.data ?? []).filter((s) => s.bookable);
  const selected = options.find((s) => `${s.date}/${s.id}` === slotKey) ?? options[0];
  const served = zones.data?.some((z) => z.pincode === pincode) ?? false;
  const totals = cart?.totals;
  const belowMinimum = totals?.minOrderPaise != null && totals.subtotalPaise < totals.minOrderPaise;
  const items = signedIn
    ? (cart?.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })) ?? [])
    : localLines;
  const missingItems = cart && cart.items.length !== items.length;

  const place = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!selected || !key) throw new Error("Select a delivery slot");
      const payload = {
        items,
        customer: { ...values, phone: `+91${values.phone}` },
        slotId: selected.id,
        slotDate: selected.date,
        note: values.note || null,
        idempotencyKey: key,
      };
      const result = await unwrap<WhatsAppOrderResult>(
        whatsapp
          ? api.api.whatsapp.order.$post({ json: payload })
          : api.api.checkout.guest.$post({ json: payload }),
      );
      // Persist the receipt before clearing the cart; a failed storage write must not fail a saved order.
      try {
        const history: GuestReceipt[] = JSON.parse(localStorage.getItem("pgrs-guest-orders") ?? "[]");
        localStorage.setItem(
          "pgrs-guest-orders",
          JSON.stringify(
            [
              {
                orderId: result.orderId,
                orderNumber: result.orderNumber,
                guestToken: result.guestToken,
                grandTotalPaise: result.grandTotalPaise,
              },
              ...history.filter((r) => r.orderId !== result.orderId),
            ].slice(0, 20),
          ),
        );
        if (remember) localStorage.setItem("pgrs-guest-details", JSON.stringify({ ...values, note: "" }));
        else localStorage.removeItem("pgrs-guest-details");
        sessionStorage.removeItem("pgrs-checkout-key");
      } catch {
        /* The private receipt remains visible even if browser storage is disabled. */
      }
      setPlaced(result);
      clear();
      if (signedIn) {
        await Promise.allSettled(
          items.map((i) => api.api.cart.items[":variantId"].$delete({ param: { variantId: i.variantId } })),
        );
        queryClient.invalidateQueries({ queryKey: ["cart"] });
      }
      return result;
    },
  });

  if (placed)
    return (
      <div className="container-page max-w-xl py-8">
        <Card className="space-y-4 p-6">
          <CheckCircle2 className="h-12 w-12 text-primary" aria-hidden />
          <h1 className="text-xl font-extrabold">
            {t("Order", "ഓർഡർ")} {placed.orderNumber} {t("placed!", "സ്ഥിരീകരിച്ചു!")}
          </h1>
          <p className="text-sm text-muted">
            {t(
              "Your order is saved. Pay cash on delivery. Keep your private tracking link to see the final bill and delivery status.",
              "ഓർഡർ ലഭിച്ചു. ഡെലിവറി സമയത്ത് പണം നൽകാം. ബില്ലും നിലയും കാണാൻ ലിങ്ക് സൂക്ഷിക്കുക.",
            )}
          </p>
          <ul className="divide-y divide-line">
            {placed.items.map((i, n) => (
              <li key={n} className="flex justify-between py-2 text-sm">
                <span>
                  {lang === "en" ? i.nameEn : i.nameMl} · {i.quantity} × {i.unitLabelEn}
                </span>
                <Money paise={i.lineTotalPaise} />
              </li>
            ))}
          </ul>
          <p className="flex justify-between text-sm">
            {t("Delivery", "ഡെലിവറി")}
            <Money paise={placed.deliveryFeePaise} />
          </p>
          <p className="flex justify-between font-bold">
            {t("Total (COD)", "ആകെ (COD)")}
            <Money paise={placed.grandTotalPaise} />
          </p>
          <p className="text-sm">
            {placed.slotDate} · {placed.slotLabelEn}
          </p>
          <Link
            className="block font-bold text-primary-700 underline"
            href={`/guest-orders/${placed.orderId}?token=${placed.guestToken}`}
          >
            {t("Track this order", "ഓർഡർ പിന്തുടരുക")}
          </Link>
          {placed.whatsappLink ? (
            <a
              className="flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-bold text-white"
              href={placed.whatsappLink}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle className="h-5 w-5" />
              {t("Send order on WhatsApp", "WhatsApp-ൽ അയക്കുക")}
            </a>
          ) : null}
          {placed.whatsappLink ? (
            <p className="text-xs text-muted">
              {t(
                "WhatsApp opens with your order filled in. Press Send in WhatsApp to share it with the shop.",
                "WhatsApp തുറന്ന ശേഷം Send അമർത്തി കടയിലേക്ക് അയക്കുക.",
              )}
            </p>
          ) : null}
          <Link href="/" className="block text-sm text-primary-700 underline">
            {t("Continue shopping", "ഷോപ്പിംഗ് തുടരുക")}
          </Link>
        </Card>
      </div>
    );

  if (isLoading)
    return <div className="container-page py-8">{t("Loading your cart…", "കൊട്ട ലോഡ് ചെയ്യുന്നു…")}</div>;
  if (error)
    return (
      <div className="container-page py-8">
        <Alert tone="warning">{error.message}</Alert>
        <Link href="/cart">{t("Back to cart", "കൊട്ടയിലേക്ക്")}</Link>
      </div>
    );
  if (!cart?.items.length)
    return (
      <div className="container-page py-8">
        <UnavailableCartNotice cart={cart} signedIn={signedIn} />
        <EmptyState
          title={t("Your cart is empty", "കൊട്ട ശൂന്യമാണ്")}
          action={<Link href="/">{t("Shop vegetables", "പച്ചക്കറികൾ വാങ്ങുക")}</Link>}
        />
      </div>
    );

  return (
    <div className="container-page grid gap-6 py-6 lg:grid-cols-[1fr_380px]">
      <form
        id="guest-checkout"
        className="space-y-4"
        onSubmit={form.handleSubmit((values) => place.mutate(values))}
      >
        <h1 className="text-2xl font-extrabold">
          {whatsapp
            ? t("Order on WhatsApp", "WhatsApp-ൽ ഓർഡർ ചെയ്യുക")
            : t("Guest checkout", "അക്കൗണ്ടില്ലാതെ ഓർഡർ")}
        </h1>
        <p className="text-sm text-muted">
          {t(
            "No account or OTP needed. Fresh vegetables delivered to your door.",
            "അക്കൗണ്ടോ OTP-യോ വേണ്ട. പച്ചക്കറികൾ വീട്ടിലെത്തും.",
          )}
        </p>
        <Card className="grid gap-3 p-5 sm:grid-cols-2">
          <Field label={t("Your name", "പേര്")} error={form.formState.errors.name?.message}>
            <Input autoComplete="name" {...form.register("name")} />
          </Field>
          <Field label={t("Mobile number", "മൊബൈൽ നമ്പർ")} error={form.formState.errors.phone?.message}>
            <Input
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              maxLength={10}
              {...form.register("phone")}
            />
          </Field>
          <Field
            className="sm:col-span-2"
            label={t("House / street", "വീട് / തെരുവ്")}
            error={form.formState.errors.line1?.message}
          >
            <Textarea autoComplete="street-address" {...form.register("line1")} />
          </Field>
          <Field label={t("Landmark (optional)", "ലാൻഡ്മാർക്ക്")}>
            <Input {...form.register("landmark")} />
          </Field>
          <Field label={t("Town / city", "നഗരം")} error={form.formState.errors.city?.message}>
            <Input autoComplete="address-level2" {...form.register("city")} />
          </Field>
          <Field label={t("Pincode", "പിൻകോഡ്")} error={form.formState.errors.pincode?.message}>
            <Input
              inputMode="numeric"
              autoComplete="postal-code"
              maxLength={6}
              {...form.register("pincode")}
            />
          </Field>
          <p className="self-end text-xs text-muted">
            {t(
              "Kottayam district only. Active delivery areas",
              "കോട്ടയം ജില്ലയിൽ മാത്രം. ഡെലിവറി ലഭ്യമായ സ്ഥലങ്ങൾ",
            )}
            :{" "}
            {zones.data
              ? zones.data.length
                ? zones.data.map((z) => `${z.areaNameEn} (${z.pincode})`).join(", ")
                : t("No delivery areas are available right now.", "നിലവിൽ ഡെലിവറി ലഭ്യമല്ല.")
              : t("Loading areas…", "ലോഡ് ചെയ്യുന്നു…")}
          </p>
        </Card>
        <Card className="space-y-3 p-5">
          <Field label={t("Delivery slot", "ഡെലിവറി സമയം")}>
            <Select
              value={selected ? `${selected.date}/${selected.id}` : ""}
              onChange={(e) => setSlotKey(e.target.value)}
              disabled={!options.length}
            >
              {options.length ? (
                options.map((s) => (
                  <option key={`${s.date}/${s.id}`} value={`${s.date}/${s.id}`}>
                    {s.date} · {lang === "en" ? s.nameEn : s.nameMl}
                  </option>
                ))
              ) : (
                <option value="">
                  {slots.isLoading
                    ? t("Loading slots…", "ലോഡ് ചെയ്യുന്നു…")
                    : t("No delivery slots available", "സമയം ലഭ്യമല്ല")}
                </option>
              )}
            </Select>
          </Field>
          <Field label={t("Order note (optional)", "കുറിപ്പ്")}>
            <Textarea {...form.register("note")} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            {t("Remember my details on this device", "ഈ ഉപകരണത്തിൽ വിവരങ്ങൾ സൂക്ഷിക്കുക")}
          </label>
        </Card>
        {whatsapp && shop.error ? <Alert tone="warning">{shop.error.message}</Alert> : null}
        {slots.error || zones.error ? (
          <Alert tone="warning">
            {t(
              "Delivery information could not load. Please try again.",
              "ഡെലിവറി വിവരങ്ങൾ ലഭിച്ചില്ല. വീണ്ടും ശ്രമിക്കുക.",
            )}
          </Alert>
        ) : null}
        {place.error ? <Alert tone="warning">{place.error.message}</Alert> : null}
      </form>
      <Card className="space-y-3 p-5 lg:sticky lg:top-24 lg:self-start">
        <h2 className="font-bold">{t("Order summary", "ഓർഡർ സംഗ്രഹം")}</h2>
        <ul className="divide-y divide-line">
          {cart.items.map((i) => (
            <li key={i.variantId} className="flex justify-between gap-2 py-2 text-sm">
              <span>
                {lang === "en" ? i.nameEn : i.nameMl} · {i.quantity} × {i.unitLabelEn}
              </span>
              <Money paise={i.lineTotalPaise} />
            </li>
          ))}
        </ul>
        <div className="flex justify-between text-sm">
          {t("Subtotal", "ഉപമൊത്തം")}
          <Money paise={totals?.subtotalPaise ?? 0} />
        </div>
        <div className="flex justify-between text-sm">
          {t("Delivery", "ഡെലിവറി")}
          {totals?.deliveryFeePaise == null ? (
            t("Enter pincode", "പിൻകോഡ് നൽകുക")
          ) : (
            <Money paise={totals.deliveryFeePaise} />
          )}
        </div>
        <div className="flex justify-between border-t border-line pt-3 font-bold">
          {t("Total (cash on delivery)", "ആകെ (COD)")}
          <Money paise={totals?.grandTotalPaise ?? totals?.subtotalPaise ?? 0} />
        </div>
        {/^[1-9]\d{5}$/.test(pincode) && !served && zones.isSuccess ? (
          <Alert tone="warning">
            {t("We do not deliver to this pincode yet.", "ഈ പിൻകോഡിൽ ഡെലിവറി ലഭ്യമല്ല.")}
          </Alert>
        ) : null}
        {belowMinimum ? (
          <Alert tone="warning">
            {t(
              `Minimum order is ${formatINR(totals?.minOrderPaise ?? 0)}. Add more items.`,
              "കൂടുതൽ സാധനങ്ങൾ ചേർക്കുക.",
            )}
          </Alert>
        ) : null}
        {missingItems ? <UnavailableCartNotice cart={cart} signedIn={signedIn} /> : null}
        <Button
          form="guest-checkout"
          type="submit"
          size="lg"
          className="w-full"
          loading={place.isPending}
          disabled={
            !served ||
            !selected ||
            !key ||
            belowMinimum ||
            Boolean(missingItems) ||
            Boolean(whatsapp && !shop.data)
          }
        >
          {t("Place order", "ഓർഡർ സ്ഥിരീകരിക്കുക")}
        </Button>
        <p className="text-xs text-muted">
          {t(
            "Vegetables are weighed when packed. Your final bill reflects the actual weight.",
            "പായ്ക്കിംഗ് സമയത്തെ യഥാർത്ഥ തൂക്കത്തിന് അനുസരിച്ചാണ് അവസാന ബിൽ.",
          )}
        </p>
        <Link href="/cart" className="block text-sm text-primary-700 underline">
          {t("Edit cart", "കൊട്ട തിരുത്തുക")}
        </Link>
        {!signedIn ? (
          <Link href="/login?next=/checkout" className="block text-xs text-muted underline">
            {t("Already have an account? Sign in", "അക്കൗണ്ടുണ്ടോ? ലോഗിൻ ചെയ്യുക")}
          </Link>
        ) : null}
      </Card>
    </div>
  );
}

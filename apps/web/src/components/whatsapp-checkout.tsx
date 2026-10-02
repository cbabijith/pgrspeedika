"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { MessageCircle, CheckCircle2 } from "lucide-react";
import { z } from "zod";
import { Alert, Button, Card, EmptyState, Field, Input, Money, Textarea } from "@pgrs/ui";
import { isKottayamPincode, type WhatsAppOrderResult } from "@pgrs/contracts";
import { api, unwrap } from "@/lib/api";
import { useCart } from "@/lib/hooks";
import { useCartStore } from "@/store/cart";
import { useUIStore } from "@/store/ui";
import { UnavailableCartNotice } from "./unavailable-cart-notice";
import type { GuestReceipt } from "./guest-checkout";

const detailsSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(80),
  phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number"),
  line1: z.string().trim().min(4, "Enter your house and street").max(200),
  landmark: z.string().trim().max(120),
  pincode: z.string().refine(isKottayamPincode, "Enter a pincode within Kottayam district"),
  city: z.string().trim().min(2, "Enter your town").max(60),
  note: z.string().trim().max(500),
});
type Details = z.infer<typeof detailsSchema>;
const defaults: Details = {
  name: "",
  phone: "",
  line1: "",
  landmark: "",
  pincode: "",
  city: "Kottayam",
  note: "",
};

/** Save a guest request, then open the shop's WhatsApp chat in this tab. */
export function WhatsAppCheckout() {
  const lang = useUIStore((s) => s.lang);
  const t = (en: string, ml: string) => (lang === "en" ? en : ml);
  const { cart, isLoading, error, refetch } = useCart();
  const lines = useCartStore((s) => s.lines);
  const clear = useCartStore((s) => s.clear);
  const form = useForm<Details>({ resolver: zodResolver(detailsSchema), defaultValues: defaults });
  const [key, setKey] = useState("");
  const [placed, setPlaced] = useState<WhatsAppOrderResult | null>(null);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("pgrs-guest-details") ?? "null");
      if (saved) form.reset({ ...defaults, ...saved, note: "" });
      let attempt = sessionStorage.getItem("pgrs-whatsapp-request-key");
      if (!attempt) {
        attempt = `request-${crypto.randomUUID()}`;
        sessionStorage.setItem("pgrs-whatsapp-request-key", attempt);
      }
      setKey(attempt);
    } catch {
      setKey(`request-${crypto.randomUUID()}`);
    }
  }, [form]);
  const send = useMutation({
    mutationFn: async (details: Details) => {
      const result = await unwrap<WhatsAppOrderResult>(
        api.api.whatsapp.request.$post({
          json: {
            items: lines,
            customer: { ...details, phone: `+91${details.phone}` },
            note: details.note || null,
            idempotencyKey: key,
          },
        }),
      );
      try {
        const old: GuestReceipt[] = JSON.parse(localStorage.getItem("pgrs-guest-orders") ?? "[]");
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
              ...old.filter((order) => order.orderId !== result.orderId),
            ].slice(0, 20),
          ),
        );
        sessionStorage.removeItem("pgrs-whatsapp-request-key");
      } catch {
        /* The receipt remains on screen when browser storage is unavailable. */
      }
      setPlaced(result);
      clear();
      window.location.assign(result.whatsappLink);
      return result;
    },
  });

  if (placed)
    return (
      <div className="container-page max-w-xl py-6">
        <Card className="space-y-4 p-5">
          <CheckCircle2 className="h-10 w-10 text-primary" aria-hidden />
          <h1 className="text-xl font-extrabold">{t("Order request saved", "ഓർഡർ അഭ്യർത്ഥന സൂക്ഷിച്ചു")}</h1>
          <p className="font-bold">{placed.orderNumber}</p>
          <p className="text-sm text-muted">
            {t(
              "Press Send in WhatsApp to share your order. The shop will confirm delivery charges, timing and the final bill.",
              "WhatsApp-ൽ Send അമർത്തുക. ഡെലിവറി ചാർജും സമയവും ബില്ലും കട സ്ഥിരീകരിക്കും.",
            )}
          </p>
          <a
            href={placed.whatsappLink}
            className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary p-3 font-bold text-white"
          >
            <MessageCircle className="h-5 w-5" />
            {t("Open WhatsApp again", "WhatsApp തുറക്കുക")}
          </a>
          <Link
            href={`/guest-orders/${placed.orderId}?token=${placed.guestToken}`}
            className="block text-sm text-primary-700 underline"
          >
            {t("View order request", "ഓർഡർ കാണുക")}
          </Link>
          <Link href="/shop" className="block text-sm text-primary-700 underline">
            {t("Continue shopping", "ഷോപ്പിംഗ് തുടരുക")}
          </Link>
        </Card>
      </div>
    );
  if (isLoading)
    return <div className="container-page py-8">{t("Loading your basket…", "കൊട്ട ലോഡ് ചെയ്യുന്നു…")}</div>;
  if (error)
    return (
      <div className="container-page space-y-3 py-8">
        <Alert tone="warning">
          {t(
            "Your items are saved. Current prices could not load. Please try again.",
            "വിലകൾ ലോഡ് ചെയ്തില്ല. വീണ്ടും ശ്രമിക്കുക.",
          )}
        </Alert>
        <Button onClick={() => refetch()}>Retry loading basket</Button>
      </div>
    );
  if (!cart?.items.length)
    return (
      <div className="container-page py-8">
        <UnavailableCartNotice cart={cart} signedIn={false} />
        <EmptyState
          title={t("Your basket is empty", "കൊട്ട ശൂന്യമാണ്")}
          action={<Link href="/shop">Shop groceries</Link>}
        />
      </div>
    );
  const missing = cart.items.length !== lines.length;
  return (
    <div className="container-page grid gap-5 py-5 lg:grid-cols-[1fr_380px]">
      <form
        id="whatsapp-checkout"
        className="space-y-4"
        onSubmit={form.handleSubmit((details) => send.mutate(details))}
      >
        <div>
          <h1 className="text-2xl font-extrabold">{t("WhatsApp checkout", "WhatsApp ചെക്കൗട്ട്")}</h1>
          <p className="mt-1 text-sm text-muted">
            {t(
              "No login or OTP. Tell us where to deliver in Kottayam district.",
              "ലോഗിനോ OTP-യോ വേണ്ട. കോട്ടയം ജില്ലയിലെ വിലാസം നൽകുക.",
            )}
          </p>
        </div>
        <Card className="grid gap-3 p-4 sm:grid-cols-2">
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
          <Field label={t("Town / city", "നഗരം")} error={form.formState.errors.city?.message}>
            <Input autoComplete="address-level2" {...form.register("city")} />
          </Field>
          <Field label={t("Pincode", "പിൻകോഡ്")} error={form.formState.errors.pincode?.message}>
            <Input
              inputMode="numeric"
              autoComplete="postal-code"
              maxLength={6}
              placeholder="686001"
              {...form.register("pincode")}
            />
          </Field>
          <Field label={t("Landmark (optional)", "ലാൻഡ്മാർക്ക്")}>
            <Input {...form.register("landmark")} />
          </Field>
          <Field className="sm:col-span-2" label={t("Order note (optional)", "കുറിപ്പ്")}>
            <Textarea
              placeholder={t("Preferred delivery time, substitutions…", "ഡെലിവറി സമയം…")}
              {...form.register("note")}
            />
          </Field>
        </Card>
        {send.error ? <Alert tone="warning">{send.error.message}</Alert> : null}
      </form>
      <Card className="space-y-3 p-4 lg:sticky lg:top-24 lg:self-start">
        <div className="flex justify-between">
          <h2 className="font-bold">{t("Your basket", "നിങ്ങളുടെ കൊട്ട")}</h2>
          <Link href="/cart" className="text-sm text-primary-700 underline">
            {t("Edit", "തിരുത്തുക")}
          </Link>
        </div>
        <ul className="divide-y divide-line">
          {cart.items.map((item) => (
            <li key={item.variantId} className="flex items-center gap-2 py-2 text-sm">
              {item.imageUrl ? (
                <img src={item.imageUrl} alt="" className="h-10 w-10 rounded-lg object-cover" />
              ) : null}
              <span className="min-w-0 flex-1">
                {lang === "en" ? item.nameEn : item.nameMl}
                <span className="block text-xs text-muted">
                  {item.quantity} × {item.unitLabelEn}
                </span>
              </span>
              <Money paise={item.lineTotalPaise} />
            </li>
          ))}
        </ul>
        <p className="flex justify-between border-t border-line pt-3 font-bold">
          {t("Items total", "സാധനങ്ങളുടെ ആകെ വില")}
          <Money paise={cart.totals.subtotalPaise} />
        </p>
        <p className="rounded-xl bg-primary-surface p-3 text-sm text-primary-700">
          {t(
            "Delivery charge and timing will be confirmed by the shop on WhatsApp. Pay cash on delivery.",
            "ഡെലിവറി ചാർജും സമയവും WhatsApp-ൽ സ്ഥിരീകരിക്കും. സാധനങ്ങൾ ലഭിക്കുമ്പോൾ പണം നൽകാം.",
          )}
        </p>
        {missing ? <UnavailableCartNotice cart={cart} signedIn={false} /> : null}
        <Button
          form="whatsapp-checkout"
          type="submit"
          size="lg"
          className="w-full"
          loading={send.isPending}
          disabled={!key || missing}
        >
          <MessageCircle className="h-5 w-5" />
          {t("Continue to WhatsApp", "WhatsApp-ലേക്ക് തുടരുക")}
        </Button>
        <p className="text-xs text-muted">
          {t(
            "WhatsApp opens with your items and address filled in. Press Send there to share it with the shop.",
            "WhatsApp തുറന്ന ശേഷം Send അമർത്തി കടയിലേക്ക് അയക്കുക.",
          )}
        </p>
      </Card>
    </div>
  );
}

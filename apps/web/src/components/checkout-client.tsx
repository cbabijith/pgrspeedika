"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Banknote, Check, CreditCard, MapPin, Plus } from "lucide-react";
import { z } from "zod";
import { Alert, Badge, Button, Card, Field, Input, Money, Skeleton, Textarea } from "@pgrs/ui";
import { formatINR, formatMinutes, type Address, type SlotAvailability } from "@pgrs/contracts";
import { api, unwrap } from "@/lib/api";
import { useCart, useSession } from "@/lib/hooks";
import { useUIStore } from "@/store/ui";

type PaymentMethod = "cod" | "razorpay";

const newAddressSchema = z.object({
  label: z.string().min(1, "Label is required").max(40),
  contactName: z.string().min(2, "Contact name is required").max(80),
  contactPhone: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number"),
  line1: z.string().min(4, "House / street is required").max(200),
  landmark: z.string().max(120),
  pincode: z.string().regex(/^[1-9]\d{5}$/, "We serve 670001, 670007, 670012, 671314"),
  city: z.string().min(2).max(60),
});
type NewAddressValues = z.infer<typeof newAddressSchema>;

const newAddressDefaults: NewAddressValues = {
  label: "Home",
  contactName: "",
  contactPhone: "",
  line1: "",
  landmark: "",
  pincode: "",
  city: "Kannur",
};

/** Full checkout: address (React Hook Form + Zod), slot, payment, order. */
export function CheckoutClient() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useSession();
  const user = session.data?.user ?? null;
  const lang = useUIStore((s) => s.lang);
  const pincode = useUIStore((s) => s.pincode);
  const t = (en: string, ml: string) => (lang === "en" ? en : ml);

  const addresses = useQuery({
    queryKey: ["addresses"],
    enabled: Boolean(user),
    queryFn: () => unwrap<Address[]>(api.api.account.addresses.$get()),
  });

  // Availability for today AND tomorrow: after the last cutoff of the day,
  // today has no bookable slots and the next bookable date is tomorrow.
  const slotDates = useMemo(() => {
    const today = new Date();
    const tomorrow = new Date(today.getTime() + 86_400_000);
    const fmt = (d: Date) =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(d);
    return [fmt(today), fmt(tomorrow)] as const;
  }, []);

  const slotsToday = useQuery({
    queryKey: ["slots", slotDates[0]],
    queryFn: () => unwrap<SlotAvailability[]>(api.api.delivery.slots.$get({ query: { date: slotDates[0] } })),
  });
  const slotsTomorrow = useQuery({
    queryKey: ["slots", slotDates[1]],
    queryFn: () => unwrap<SlotAvailability[]>(api.api.delivery.slots.$get({ query: { date: slotDates[1] } })),
  });
  const slotOptions: Array<SlotAvailability & { dayLabel: string }> = useMemo(() => {
    const label = (date: string, idx: number) =>
      date === slotDates[0] ? t("Today", "ഇന്ന്") : idx === 1 ? t("Tomorrow", "നാളെ") : date;
    return [
      ...(slotsToday.data ?? []).map((s) => ({ ...s, dayLabel: label(s.date, 0) })),
      ...(slotsTomorrow.data ?? []).map((s) => ({ ...s, dayLabel: label(s.date, 1) })),
    ];
  }, [slotsToday.data, slotsTomorrow.data, slotDates, t]);

  const { cart } = useCart(pincode);

  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [showNewAddress, setShowNewAddress] = useState(false);
  const newAddressForm = useForm<NewAddressValues>({
    resolver: zodResolver(newAddressSchema),
    mode: "onChange",
    defaultValues: newAddressDefaults,
  });
  const [slotId, setSlotId] = useState<string | null>(null);
  const [slotDate, setSlotDate] = useState<string | null>(null);
  const [payment, setPayment] = useState<PaymentMethod>("cod");
  const [placing, setPlacing] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState("");

  useEffect(() => {
    if (!idempotencyKey) {
      setIdempotencyKey(`web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
    }
  }, [idempotencyKey]);

  useEffect(() => {
    const first = addresses.data?.find((a) => a.isDefault) ?? addresses.data?.[0];
    if (first && !selectedAddressId) setSelectedAddressId(first.id);
    if (addresses.data && addresses.data.length === 0) setShowNewAddress(true);
  }, [addresses.data, selectedAddressId]);

  useEffect(() => {
    if (!slotId) {
      const first = slotOptions.find((s) => s.bookable);
      if (first) {
        setSlotId(first.id);
        setSlotDate(first.date);
      }
    }
  }, [slotOptions, slotId]);

  function pickSlot(option: { id: string; date: string }) {
    setSlotId(option.id);
    setSlotDate(option.date);
  }

  const totals = cart?.totals;
  const minNotMet = totals?.minOrderPaise != null && totals.subtotalPaise < totals.minOrderPaise;
  // watch() re-renders on every keystroke; a synchronous safeParse gives a
  // deterministic enable gate (formState.isValid lags with resolvers).
  const addressValues = newAddressForm.watch();
  const newAddressValid = newAddressSchema.safeParse(addressValues).success;
  const canPlace =
    Boolean(user) &&
    (Boolean(selectedAddressId) || (showNewAddress && newAddressValid)) &&
    Boolean(slotId) &&
    cart != null &&
    cart.items.length > 0 &&
    !minNotMet &&
    !placing;

  async function placeOrder() {
    if (!slotId || !cart) return;
    setPlacing(true);
    try {
      // New addresses travel inline; the backend validates + persists them.
      let payloadAddress: { address: Record<string, unknown> } | { addressId: string | undefined };
      if (showNewAddress) {
        // Validate through RHF before sending; the backend re-validates anyway.
        const values = await newAddressForm.trigger();
        if (!values) {
          toast.error(t("Please complete the delivery address", "ഡെലിവറി വിലാസം പൂർത്തിയാക്കുക"));
          setPlacing(false);
          return;
        }
        const v = newAddressForm.getValues();
        payloadAddress = {
          address: {
            label: v.label,
            contactName: v.contactName,
            contactPhone: `+91${v.contactPhone.replace(/\D/g, "")}`,
            line1: v.line1,
            line2: null,
            landmark: v.landmark || null,
            pincode: v.pincode,
            city: v.city,
            isDefault: true,
          },
        };
      } else {
        payloadAddress = { addressId: selectedAddressId ?? undefined };
      }

      const result = await unwrap<{
        orderId: string;
        orderNumber: string;
        status: string;
        payment?: {
          providerOrderId: string;
          amountPaise: number;
          keyId: string | null;
          mock: boolean;
          paymentId: string;
          mockPay?: { paymentId: string; signature: string };
        };
      }>(
        api.api.checkout.order.$post({
          json: {
            ...payloadAddress,
            slotId,
            slotDate: slotDate ?? slotOptions.find((s) => s.id === slotId)?.date ?? "",
            paymentMethod: payment,
            couponCode: cart.couponCode ?? undefined,
            idempotencyKey,
          } as never,
        }),
      );

      if (payment === "razorpay" && result.status === "pending_payment" && result.payment) {
        // Mock payments complete directly with the server-signed pseudo payment;
        // real Razorpay opens the hosted checkout.
        if (result.payment.mock && result.payment.mockPay) {
          await unwrap(
            api.api.payments.verify.$post({
              json: {
                razorpayOrderId: result.payment.providerOrderId,
                razorpayPaymentId: result.payment.mockPay.paymentId,
                razorpaySignature: result.payment.mockPay.signature,
              },
            }),
          );
        } else {
          await payWithRazorpay(result.payment, result.orderId);
        }
      }
      queryClient.invalidateQueries({ queryKey: ["cart"] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      router.push(`/orders/${result.orderId}?placed=1`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not place the order");
      setIdempotencyKey(`web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
    } finally {
      setPlacing(false);
    }
  }

  if (!user) {
    return (
      <div className="container-page py-10">
        <Alert tone="warning" title={t("Please sign in", "ലോഗിൻ ചെയ്യുക")}>
          {t("Login with your phone number to checkout.", "ചെക്കൗട്ടിന് ലോഗിൻ ചെയ്യുക.")}{" "}
          <a href="/login?next=/checkout" className="font-bold underline">
            {t("Go to login", "ലോഗിൻ")}
          </a>
          {" · "}
          <a href="/whatsapp" className="font-bold underline">
            {t("or order on WhatsApp as guest", "അല്ലെങ്കിൽ WhatsApp-ൽ ഓർഡർ ചെയ്യൂ")}
          </a>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container-page grid gap-6 py-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-5">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">{t("Checkout", "ചെക്കൗട്ട്")}</h1>

        {/* Address */}
        <Card className="p-5">
          <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-ink">
            <MapPin className="h-4 w-4 text-primary-700" aria-hidden />
            {t("Delivery address", "ഡെലിവറി വിലാസം")}
          </h2>
          {addresses.isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : (
            <div className="space-y-2">
              {(addresses.data ?? []).map((a) => (
                <label
                  key={a.id}
                  className={
                    selectedAddressId === a.id && !showNewAddress
                      ? "flex cursor-pointer items-start gap-3 rounded-xl border-2 border-primary bg-primary-50 p-3"
                      : "flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3 hover:border-primary-300"
                  }
                >
                  <input
                    type="radio"
                    name="address"
                    className="mt-1 accent-primary"
                    checked={selectedAddressId === a.id && !showNewAddress}
                    onChange={() => {
                      setSelectedAddressId(a.id);
                      setShowNewAddress(false);
                    }}
                  />
                  <span className="text-sm">
                    <span className="font-bold text-ink">
                      {a.label} · {a.contactName}{" "}
                      {a.isDefault ? <Badge tone="green">{t("Default", "ഡിഫോൾട്ട്")}</Badge> : null}
                    </span>
                    <span className="block text-muted">
                      {a.line1}
                      {a.line2 ? `, ${a.line2}` : ""} {a.landmark ? `(${a.landmark})` : ""}
                    </span>
                    <span className="block text-muted">
                      {a.areaName}, {a.city} — {a.pincode} · {a.contactPhone}
                    </span>
                  </span>
                </label>
              ))}
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-line p-3 text-sm font-bold text-primary-700">
                <input
                  type="radio"
                  name="address"
                  className="accent-primary"
                  checked={showNewAddress}
                  onChange={() => setShowNewAddress(true)}
                />
                <Plus className="h-4 w-4" aria-hidden />
                {t("Add a new address", "പുതിയ വിലാസം ചേർക്കുക")}
              </label>
              {showNewAddress ? <NewAddressForm lang={lang} form={newAddressForm} /> : null}
            </div>
          )}
        </Card>

        {/* Slot */}
        <Card className="p-5">
          <h2 className="mb-3 text-base font-bold text-ink">{t("Delivery slot", "ഡെലിവറി സ്ലോട്ട്")}</h2>
          {slotsToday.isLoading || slotsTomorrow.isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {slotOptions.map((s) => (
                <label
                  key={`${s.date}-${s.id}`}
                  className={
                    !s.bookable
                      ? "flex cursor-not-allowed items-center justify-between rounded-xl border border-line bg-surface-muted p-3 opacity-60"
                      : slotId === s.id
                        ? "flex cursor-pointer items-center justify-between rounded-xl border-2 border-primary bg-primary-50 p-3"
                        : "flex cursor-pointer items-center justify-between rounded-xl border border-line p-3 hover:border-primary-300"
                  }
                >
                  <input
                    type="radio"
                    name="slot"
                    className="accent-primary"
                    disabled={!s.bookable}
                    checked={slotId === s.id}
                    onChange={() => pickSlot(s)}
                  />
                  <span className="flex-1 px-2 text-sm">
                    <span className="font-bold text-ink">{lang === "en" ? s.nameEn : s.nameMl}</span>
                    <span className="block text-xs text-muted">
                      {s.dayLabel} · {formatMinutes(s.startMinutes)}–{formatMinutes(s.endMinutes)}
                    </span>
                  </span>
                  {s.bookable ? (
                    <Badge tone={s.remaining <= 5 ? "amber" : "green"}>
                      {s.remaining <= 5
                        ? t(`${s.remaining} left`, `${s.remaining} ബാക്കി`)
                        : t("Available", "ലഭ്യം")}
                    </Badge>
                  ) : (
                    <Badge tone="red">
                      {s.closed
                        ? t("Holiday — shop closed", "അവധി — കട അടച്ചിരിക്കുന്നു")
                        : s.cutoffPassed
                          ? t("Closed", "അടച്ചു")
                          : t("Full", "നിറഞ്ഞു")}
                    </Badge>
                  )}
                </label>
              ))}
            </div>
          )}
        </Card>

        {/* Payment */}
        <Card className="p-5">
          <h2 className="mb-3 text-base font-bold text-ink">{t("Payment", "പേയ്മെന്റ്")}</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            <PaymentOption
              selected={payment === "razorpay"}
              onSelect={() => setPayment("razorpay")}
              icon={<CreditCard className="h-5 w-5" aria-hidden />}
              title={t("UPI / Card (Razorpay)", "യുപിഐ / കാർഡ്")}
              subtitle={t("Secure online payment", "സുരക്ഷിത ഓൺലൈൻ പേയ്മെന്റ്")}
            />
            <PaymentOption
              selected={payment === "cod"}
              onSelect={() => setPayment("cod")}
              icon={<Banknote className="h-5 w-5" aria-hidden />}
              title={t("Cash on delivery", "ഡെലിവറി സമയത്ത് പണം")}
              subtitle={t("Pay the final bill at your door", "വാതിലിൽ പണമടയ്ക്കാം")}
            />
          </div>
          <p className="mt-3 text-xs text-muted">
            {t(
              "Loose items are weighed at packing — your final bill may change slightly and prepaid differences are refunded automatically.",
              "പായ്ക്കിംഗ് സമയത്ത് തൂക്കും — ബിൽ അല്പം മാറാം; കൂടിയത് ഓട്ടോമാറ്റിക് തിരികെ നൽകും.",
            )}
          </p>
        </Card>
      </div>

      {/* Summary */}
      <div className="lg:sticky lg:top-24 lg:self-start">
        <Card className="p-5">
          <h2 className="mb-3 text-base font-bold text-ink">{t("Order summary", "ഓർഡർ സംഗ്രഹം")}</h2>
          {!cart || cart.items.length === 0 ? (
            <p className="text-sm text-muted">{t("Your cart is empty.", "കൊട്ട ശൂന്യമാണ്.")}</p>
          ) : (
            <>
              <ul className="mb-4 max-h-56 space-y-2 overflow-y-auto text-sm">
                {cart.items.map((l) => (
                  <li key={l.variantId} className="flex justify-between gap-2">
                    <span className="text-muted">
                      {lang === "en" ? l.nameEn : l.nameMl} × {l.quantity}{" "}
                      <span className="text-xs">({l.unitLabelEn})</span>
                    </span>
                    <Money paise={l.lineTotalPaise} className="font-semibold" />
                  </li>
                ))}
              </ul>
              <dl className="space-y-1.5 border-t border-line pt-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted">{t("Subtotal", "ഉപമൊത്തം")}</dt>
                  <dd>
                    <Money paise={totals?.subtotalPaise ?? 0} className="font-bold" />
                  </dd>
                </div>
                {totals && totals.discountPaise > 0 ? (
                  <div className="flex justify-between text-primary-700">
                    <dt>
                      {t("Coupon", "കൂപ്പൺ")} {cart.couponCode}
                    </dt>
                    <dd>
                      - <Money paise={totals.discountPaise} className="font-bold" />
                    </dd>
                  </div>
                ) : null}
                <div className="flex justify-between">
                  <dt className="text-muted">{t("Delivery", "ഡെലിവറി")}</dt>
                  <dd>
                    {totals?.deliveryFeePaise == null ? (
                      <span className="text-xs text-muted">{t("set at address", "വിലാസം അനുസരിച്ച്")}</span>
                    ) : totals.deliveryFeePaise === 0 ? (
                      <span className="font-bold text-primary-700">{t("FREE", "സൗജന്യം")}</span>
                    ) : (
                      <Money paise={totals.deliveryFeePaise} className="font-bold" />
                    )}
                  </dd>
                </div>
                <div className="flex justify-between border-t border-line pt-2 text-base">
                  <dt className="font-extrabold">{t("To pay", "അടയ്ക്കാനുള്ളത്")}</dt>
                  <dd>
                    <Money
                      paise={totals?.grandTotalPaise ?? totals?.subtotalPaise ?? 0}
                      className="font-extrabold text-primary-700"
                    />
                  </dd>
                </div>
              </dl>
              {minNotMet ? (
                <Alert tone="warning">
                  {t(
                    `Minimum order for this area is ${formatINR(totals?.minOrderPaise ?? 0)}`,
                    `ഈ പ്രദേശത്തിന്റെ മിനിമം ${formatINR(totals?.minOrderPaise ?? 0)}`,
                  )}
                </Alert>
              ) : null}
              <Button
                size="lg"
                className="mt-4 w-full"
                onClick={placeOrder}
                disabled={!canPlace}
                loading={placing}
              >
                {t("Place order", "ഓർഡർ സ്ഥിരീകരിക്കുക")}
              </Button>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

function PaymentOption({
  selected,
  onSelect,
  icon,
  title,
  subtitle,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <label
      className={
        selected
          ? "flex cursor-pointer items-start gap-3 rounded-xl border-2 border-primary bg-primary-50 p-3"
          : "flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3 hover:border-primary-300"
      }
    >
      <input
        type="radio"
        name="payment"
        className="mt-1 accent-primary"
        checked={selected}
        onChange={onSelect}
      />
      <span className="text-primary-700">{icon}</span>
      <span className="text-sm">
        <span className="font-bold text-ink">{title}</span>
        <span className="block text-xs text-muted">{subtitle}</span>
      </span>
      {selected ? <Check className="ml-auto h-4 w-4 text-primary-700" aria-hidden /> : null}
    </label>
  );
}

function NewAddressForm({ lang, form }: { lang: "en" | "ml"; form: UseFormReturn<NewAddressValues> }) {
  const t = (en: string, ml: string) => (lang === "en" ? en : ml);
  const errors = form.formState.errors;

  return (
    <Card className="space-y-3 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("Label", "ലേബൽ")} error={errors.label?.message}>
          <Input id="na-label" {...form.register("label")} />
        </Field>
        <Field label={t("Contact name", "ബന്ധപ്പെടാനുള്ള പേര്")} error={errors.contactName?.message}>
          <Input id="na-contact" {...form.register("contactName")} />
        </Field>
        <Field label={t("Phone", "ഫോൺ")} error={errors.contactPhone?.message}>
          <Input id="na-phone" inputMode="numeric" {...form.register("contactPhone")} />
        </Field>
        <Field
          label={t("Pincode", "പിൻകോഡ്")}
          hint="We serve 670001, 670007, 670012, 671314"
          error={errors.pincode?.message}
        >
          <Input id="na-pincode" inputMode="numeric" {...form.register("pincode")} />
        </Field>
      </div>
      <Field label={t("House / street", "വീട് / തെരുവ്")} error={errors.line1?.message}>
        <Textarea id="na-line1" {...form.register("line1")} />
      </Field>
      <Field label={t("Landmark", "ലാൻഡ്മാർക്ക്")} error={errors.landmark?.message}>
        <Input id="na-landmark" {...form.register("landmark")} />
      </Field>
      <p className="text-xs text-muted">
        {t(
          "The address is saved to your account when you place the order.",
          "ഓർഡർ സ്ഥിരീകരിക്കുമ്പോൾ വിലാസം സേവ് ചെയ്യും.",
        )}
      </p>
    </Card>
  );
}

async function payWithRazorpay(
  payment: { providerOrderId: string; amountPaise: number; keyId: string | null },
  _orderId: string,
): Promise<void> {
  // Load the checkout script and open the Razorpay modal.
  await new Promise<void>((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("No window"));
    if (!document.getElementById("razorpay-checkout-js")) {
      const script = document.createElement("script");
      script.id = "razorpay-checkout-js";
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Could not load Razorpay checkout"));
      document.body.appendChild(script);
    } else {
      resolve();
    }
  });
  const RazorpayCtor = (window as unknown as { Razorpay?: new (options: unknown) => { open: () => void } })
    .Razorpay;
  if (!RazorpayCtor || !payment.keyId) throw new Error("Razorpay checkout unavailable");

  await new Promise<void>((resolve, reject) => {
    const rzp = new RazorpayCtor({
      key: payment.keyId,
      order_id: payment.providerOrderId,
      amount: payment.amountPaise,
      currency: "INR",
      name: "PGRS Peedika",
      description: "Fresh groceries order",
      theme: { color: "#1B7A3E" },
      handler: async (response: {
        razorpay_order_id: string;
        razorpay_payment_id: string;
        razorpay_signature: string;
      }) => {
        try {
          await unwrap(
            api.api.payments.verify.$post({
              json: {
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              },
            }),
          );
          resolve();
        } catch (err) {
          reject(err instanceof Error ? err : new Error("Verification failed"));
        }
      },
      modal: {
        ondismiss: () => reject(new Error("Payment cancelled")),
      },
    });
    rzp.open();
  });
}

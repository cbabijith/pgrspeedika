"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Alert, Button, EmptyState, Money, QuantityStepper } from "@pgrs/ui";
import { formatINR } from "@pgrs/contracts";
import { useCart, useCartActions, useSession } from "@/lib/hooks";
import { useUIStore } from "@/store/ui";

/** Full-page cart with free-delivery progress bar. */
export function CartFull() {
  const router = useRouter();
  const session = useSession();
  const signedIn = Boolean(session.data?.user);
  const pincode = useUIStore((s) => s.pincode);
  const lang = useUIStore((s) => s.lang);
  const { cart, isLoading } = useCart(pincode);
  const actions = useCartActions();
  const t = (en: string, ml: string) => (lang === "en" ? en : ml);

  const totals = cart?.totals;
  const progress =
    totals?.freeDeliveryGapPaise != null && totals.subtotalPaise > 0
      ? Math.min(100, (totals.subtotalPaise / (totals.subtotalPaise + totals.freeDeliveryGapPaise)) * 100)
      : totals?.deliveryFeePaise === 0
        ? 100
        : 0;

  if (isLoading) {
    return (
      <div className="container-page py-10 text-sm text-muted">
        {t("Loading cart…", "കൊട്ട ലോഡ് ചെയ്യുന്നു…")}
      </div>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="container-page py-10">
        <EmptyState
          title={t("Your cart is empty", "കൊട്ട ശൂന്യമാണ്")}
          description={t("Fresh vegetables are waiting for you.", "പുത്തൻ പച്ചക്കറികൾ കാത്തിരിക്കുന്നു.")}
          action={<Button onClick={() => router.push("/")}>{t("Start shopping", "ഷോപ്പ് ചെയ്യുക")}</Button>}
        />
      </div>
    );
  }

  return (
    <div className="container-page grid gap-6 py-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">
          {t("Your cart", "നിങ്ങളുടെ കൊട്ട")} ({cart.itemCount})
        </h1>

        {totals?.freeDeliveryGapPaise != null && totals.freeDeliveryGapPaise > 0 ? (
          <div className="rounded-card border border-primary-200 bg-primary-50 p-4">
            <p className="mb-2 text-sm font-semibold text-primary-800">
              {t(
                `${formatINR(totals.freeDeliveryGapPaise)} away from FREE delivery`,
                `സൗജന്യ ഡെലിവറിക്ക് ${formatINR(totals.freeDeliveryGapPaise)} ബാക്കി`,
              )}
            </p>
            <div className="h-2 overflow-hidden rounded-full bg-white">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : totals?.deliveryFeePaise === 0 ? (
          <Alert tone="success">{t("You've unlocked FREE delivery! 🎉", "സൗജന്യ ഡെലിവറി ലഭിച്ചു! 🎉")}</Alert>
        ) : null}

        <ul className="divide-y divide-line rounded-card border border-line bg-white">
          {cart.items.map((line) => (
            <li key={line.variantId} className="flex gap-4 p-4">
              {line.imageUrl ? (
                <img src={line.imageUrl} alt="" className="h-20 w-20 rounded-xl object-cover" />
              ) : null}
              <div className="flex flex-1 flex-col gap-1.5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-ink">{lang === "en" ? line.nameEn : line.nameMl}</p>
                    <p className="text-xs text-muted">
                      {formatINR(line.unitPricePaise)} / {lang === "en" ? line.unitLabelEn : line.unitLabelMl}
                      {line.gstRate > 0 ? ` · GST ${line.gstRate}% incl.` : ""}
                    </p>
                  </div>
                  <Money paise={line.lineTotalPaise} className="text-base font-extrabold text-primary-700" />
                </div>
                <div className="flex items-center justify-between">
                  <QuantityStepper
                    value={line.quantity}
                    min={0}
                    onChange={(q) =>
                      actions.setQuantity.mutate(
                        { variantId: line.variantId, quantity: q },
                        { onError: (err) => toast.error(err.message) },
                      )
                    }
                    ariaLabel={`Quantity for ${line.nameEn}`}
                  />
                  <button
                    type="button"
                    onClick={() => actions.remove.mutate(line.variantId)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-danger hover:underline"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    {t("Remove", "നീക്കുക")}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="lg:sticky lg:top-24 lg:self-start">
        <div className="space-y-3 rounded-card border border-line bg-white p-5 shadow-card">
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">{t("Subtotal", "ഉപമൊത്തം")}</dt>
              <dd>
                <Money paise={totals?.subtotalPaise ?? 0} className="font-bold" />
              </dd>
            </div>
            {totals && totals.discountPaise > 0 ? (
              <div className="flex justify-between text-primary-700">
                <dt>{t("Coupon discount", "കൂപ്പൺ കിഴിവ്")}</dt>
                <dd>
                  - <Money paise={totals.discountPaise} className="font-bold" />
                </dd>
              </div>
            ) : null}
            <div className="flex justify-between">
              <dt className="text-muted">{t("Delivery", "ഡെലിവറി")}</dt>
              <dd>
                {totals?.deliveryFeePaise == null ? (
                  <span className="text-xs text-muted">{t("at checkout", "ചെക്കൗട്ടിൽ")}</span>
                ) : totals.deliveryFeePaise === 0 ? (
                  <span className="font-bold text-primary-700">{t("FREE", "സൗജന്യം")}</span>
                ) : (
                  <Money paise={totals.deliveryFeePaise} className="font-bold" />
                )}
              </dd>
            </div>
            <div className="flex justify-between border-t border-line pt-2 text-base">
              <dt className="font-extrabold">{t("Total", "ആകെ")}</dt>
              <dd>
                <Money
                  paise={totals?.grandTotalPaise ?? totals?.subtotalPaise ?? 0}
                  className="font-extrabold text-primary-700"
                />
              </dd>
            </div>
          </dl>
          {!signedIn ? (
            <Alert tone="info">
              {t(
                "Login with your phone at checkout — your cart comes along.",
                "ചെക്കൗട്ടിൽ ലോഗിൻ ചെയ്യൂ — കൊട്ട നിലനിൽക്കും.",
              )}
            </Alert>
          ) : null}
          <Button
            size="lg"
            className="w-full"
            onClick={() => router.push(signedIn ? "/checkout" : "/login?next=/checkout")}
          >
            {t("Proceed to checkout", "ചെക്കൗട്ടിലേക്ക്")}
          </Button>
          <Link href="/" className="block text-center text-xs font-semibold text-primary-700 underline">
            {t("Continue shopping", "ഷോപ്പിംഗ് തുടരുക")}
          </Link>
        </div>
      </div>
    </div>
  );
}

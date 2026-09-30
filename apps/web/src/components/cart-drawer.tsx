"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShoppingCart, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button, EmptyState, Money, QuantityStepper, Sheet, Skeleton, Alert } from "@pgrs/ui";
import { formatINR } from "@pgrs/contracts";
import { useCart, useCartActions } from "@/lib/hooks";
import { useUIStore } from "@/store/ui";

/** Cart drawer opened from the header. Guests see the priced preview. */
export function CartDrawer() {
  const router = useRouter();
  const open = useUIStore((s) => s.cartOpen);
  const setOpen = useUIStore((s) => s.setCartOpen);
  const pincode = useUIStore((s) => s.pincode);
  const lang = useUIStore((s) => s.lang);
  const { cart, isLoading, signedIn } = useCart(pincode);
  const actions = useCartActions();
  const [coupon, setCoupon] = useState("");
  const [couponPending, setCouponPending] = useState(false);

  const t = (en: string, ml: string) => (lang === "en" ? en : ml);
  const totals = cart?.totals;

  async function submitCoupon(code: string | null) {
    if (code === null) {
      actions.removeCoupon.mutate(undefined, { onError: (err) => toast.error(err.message) });
      return;
    }
    if (!code.trim()) return;
    setCouponPending(true);
    try {
      await actions.applyCoupon.mutateAsync(code.trim().toUpperCase());
      toast.success(t("Coupon applied", "കൂപ്പൺ പ്രയോഗിച്ചു"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not apply coupon");
    } finally {
      setCouponPending(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen} title={t("Your cart", "നിങ്ങളുടെ കൊട്ട")}>
      {isLoading ? (
        <div className="space-y-3 p-5">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : !cart || cart.items.length === 0 ? (
        <div className="p-5">
          <EmptyState
            icon={<ShoppingCart className="h-10 w-10" />}
            title={t("Your cart is empty", "കൊട്ട ശൂന്യമാണ്")}
            description={t(
              "Add fresh vegetables and groceries to get started.",
              "പച്ചക്കറികളും ഗ്രോസറികളും ചേർക്കുക.",
            )}
            action={
              <Button onClick={() => setOpen(false)}>{t("Continue shopping", "ഷോപ്പിംഗ് തുടരുക")}</Button>
            }
          />
        </div>
      ) : (
        <>
          <ul className="divide-y divide-line">
            {cart.items.map((line) => (
              <li key={line.variantId} className="flex gap-3 p-4">
                {line.imageUrl ? (
                  <img src={line.imageUrl} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
                ) : null}
                <div className="flex flex-1 flex-col gap-1">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-ink">
                        {lang === "en" ? line.nameEn : line.nameMl}
                      </p>
                      <p className="text-xs text-muted">
                        {formatINR(line.unitPricePaise)} /{" "}
                        {lang === "en" ? line.unitLabelEn : line.unitLabelMl}
                      </p>
                    </div>
                    <Money paise={line.lineTotalPaise} className="text-sm font-extrabold text-primary-700" />
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
                      size="sm"
                      ariaLabel={`Quantity for ${line.nameEn}`}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        actions.remove.mutate(line.variantId, {
                          onError: (err) => toast.error(err.message),
                        })
                      }
                      className="rounded-full p-2 text-muted hover:bg-danger-surface hover:text-danger"
                      aria-label={`Remove ${line.nameEn}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div className="sticky bottom-0 space-y-3 border-t border-line bg-white p-5">
            {signedIn ? (
              cart.couponCode ? (
                <div className="flex items-center justify-between rounded-xl bg-primary-surface px-3 py-2 text-sm">
                  <span className="font-bold text-primary-700">
                    {t("Coupon", "കൂപ്പൺ")}: {cart.couponCode}
                  </span>
                  <button
                    type="button"
                    className="font-semibold text-danger underline"
                    onClick={() => submitCoupon(null)}
                  >
                    {t("Remove", "നീക്കുക")}
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    value={coupon}
                    onChange={(e) => setCoupon(e.target.value.toUpperCase())}
                    placeholder={t("Coupon code (e.g. WELCOME10)", "കൂപ്പൺ കോഡ്")}
                    className="flex-1 rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-primary"
                    aria-label="Coupon code"
                  />
                  <Button variant="secondary" onClick={() => submitCoupon(coupon)} loading={couponPending}>
                    {t("Apply", "പ്രയോഗിച്ചു")}
                  </Button>
                </div>
              )
            ) : null}

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
              {totals?.deliveryFeePaise != null ? (
                <div className="flex justify-between">
                  <dt className="text-muted">{t("Delivery", "ഡെലിവറി")}</dt>
                  <dd>
                    {totals.deliveryFeePaise === 0 ? (
                      <span className="font-bold text-primary-700">{t("FREE", "സൗജന്യം")}</span>
                    ) : (
                      <Money paise={totals.deliveryFeePaise} className="font-bold" />
                    )}
                  </dd>
                </div>
              ) : null}
              {totals?.grandTotalPaise != null ? (
                <div className="flex justify-between border-t border-line pt-2 text-base">
                  <dt className="font-extrabold">{t("Total", "ആകെ")}</dt>
                  <dd>
                    <Money paise={totals.grandTotalPaise} className="font-extrabold text-primary-700" />
                  </dd>
                </div>
              ) : null}
            </dl>

            {totals?.freeDeliveryGapPaise != null && totals.freeDeliveryGapPaise > 0 ? (
              <Alert tone="info">
                {t(
                  `Add ${formatINR(totals.freeDeliveryGapPaise)} more for free delivery`,
                  `സൗജന്യ ഡെലിവറിക്ക് ${formatINR(totals.freeDeliveryGapPaise)} കൂടി ചേർക്കുക`,
                )}
              </Alert>
            ) : null}

            <Button
              size="lg"
              className="w-full"
              onClick={() => {
                setOpen(false);
                router.push(signedIn ? "/checkout" : "/login?next=/checkout");
              }}
            >
              {t("Checkout", "ചെക്കൗട്ട്")}
              {totals?.grandTotalPaise != null ? (
                <>
                  {" · "}
                  <Money paise={totals.grandTotalPaise} />
                </>
              ) : null}
            </Button>
          </div>
        </>
      )}
    </Sheet>
  );
}

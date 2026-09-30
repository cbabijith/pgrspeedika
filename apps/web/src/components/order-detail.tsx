"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Circle, Download, XCircle } from "lucide-react";
import { Alert, Button, Card, Money, Skeleton, StatusBadge } from "@pgrs/ui";
import { ORDER_TIMELINE, formatGrams, isCancellable, type OrderDTO } from "@pgrs/contracts";
import { API_URL, api, unwrap } from "@/lib/api";
import { useUIStore } from "@/store/ui";

/** Order detail: status timeline, final bill with weight adjustment, invoice. */
export function OrderDetail() {
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const lang = useUIStore((s) => s.lang);
  const t = (en: string, ml: string) => (lang === "en" ? en : ml);
  const [cancelling, setCancelling] = useState(false);

  const order = useQuery({
    queryKey: ["order", params.id],
    queryFn: () => unwrap<OrderDTO>(api.api.orders[":id"].$get({ param: { id: params.id } })),
    refetchInterval: 30_000,
  });

  const reorder = useMutation({
    mutationFn: () =>
      unwrap<{ restored: number; missing: number }>(
        api.api.orders[":id"].reorder.$post({ param: { id: params.id } }),
      ),
    onSuccess: (data) => {
      toast.success(
        t(
          `${data.restored} items added back to your cart${data.missing ? ` (${data.missing} unavailable)` : ""}`,
          `${data.restored} ഇനങ്ങൾ കൊട്ടയിൽ ചേർത്തു`,
        ),
      );
      queryClient.invalidateQueries({ queryKey: ["cart"] });
    },
    onError: (err) => toast.error(err.message),
  });

  const cancel = useMutation({
    mutationFn: (reason: string) =>
      unwrap<OrderDTO>(api.api.orders[":id"].cancel.$post({ param: { id: params.id }, json: { reason } })),
    onSuccess: () => {
      toast.success(
        t(
          "Order cancelled. Refunds start automatically for prepaid orders.",
          "ഓർഡർ റദ്ദാക്കി. പ്രീപെയ്ഡ് ആണെങ്കിൽ റീഫണ്ട് തുടങ്ങും.",
        ),
      );
      queryClient.invalidateQueries({ queryKey: ["order", params.id] });
    },
    onError: (err) => toast.error(err.message),
  });

  if (order.isLoading) {
    return (
      <div className="container-page space-y-4 py-8">
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (!order.data) {
    return (
      <div className="container-page py-10">
        <Alert tone="danger">{t("Order not found.", "ഓർഡർ കിട്ടിയില്ല.")}</Alert>
      </div>
    );
  }

  const o = order.data;
  const effective = o.finalGrandTotalPaise ?? o.grandTotalPaise;
  const reachedIndex = ORDER_TIMELINE.indexOf(o.status as (typeof ORDER_TIMELINE)[number]);

  return (
    <div className="container-page grid gap-6 py-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-ink">{o.orderNumber}</h1>
            <p className="text-sm text-muted">
              {t("Placed", "സ്ഥാപിച്ചത്")}{" "}
              {new Date(o.placedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
            </p>
          </div>
          <StatusBadge status={o.status} lang={lang} />
        </div>

        {o.status === "cancelled" ? (
          <Alert tone="danger" title={t("Order cancelled", "ഓർഡർ റദ്ദാക്കി")}>
            {o.cancellationReason}
            {o.refundIssuedPaise > 0 ? (
              <>
                {" "}
                · <Money paise={o.refundIssuedPaise} /> {t("refunded", "തിരികെ നൽകി")}
              </>
            ) : null}
          </Alert>
        ) : (
          <Card className="p-5">
            <h2 className="mb-4 text-base font-bold text-ink">{t("Delivery progress", "ഡെലിവറി പുരോഗതി")}</h2>
            <ol className="space-y-0">
              {ORDER_TIMELINE.map((status, i) => {
                const done = reachedIndex >= i && o.status !== "cancelled";
                const historyNote = o.history.find((h) => h.toStatus === status);
                return (
                  <li key={status} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      {done ? (
                        <CheckCircle2 className="h-6 w-6 text-primary" aria-hidden />
                      ) : (
                        <Circle className="h-6 w-6 text-line" aria-hidden />
                      )}
                      {i < ORDER_TIMELINE.length - 1 ? (
                        <span
                          className={done ? "w-0.5 flex-1 bg-primary" : "w-0.5 flex-1 bg-line"}
                          style={{ minHeight: 28 }}
                        />
                      ) : null}
                    </div>
                    <div className="pb-4">
                      <p className={done ? "text-sm font-bold text-ink" : "text-sm font-semibold text-muted"}>
                        {status === "confirmed"
                          ? t("Order placed", "ഓർഡർ സ്വീകരിച്ചു")
                          : status === "packed"
                            ? t("Packed with fresh weights", "പുത്തൻ തൂക്കത്തിൽ പായ്ക്ക്")
                            : status === "out_for_delivery"
                              ? t("Out for delivery", "ഡെലിവറിക്ക് പുറപ്പെട്ടു")
                              : t("Delivered", "എത്തിച്ചു")}
                      </p>
                      {historyNote ? (
                        <p className="text-xs text-muted">
                          {new Date(historyNote.createdAt).toLocaleString("en-IN", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                          {historyNote.note ? ` · ${historyNote.note}` : ""}
                        </p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          </Card>
        )}

        <Card className="p-5">
          <h2 className="mb-3 text-base font-bold text-ink">
            {t("Items", "ഇനങ്ങൾ")} ({o.items.length})
          </h2>
          <ul className="divide-y divide-line">
            {o.items.map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-3 py-3">
                <div className="flex gap-3">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt="" className="h-12 w-12 rounded-lg object-cover" />
                  ) : null}
                  <div>
                    <p className="text-sm font-bold text-ink">{lang === "en" ? item.nameEn : item.nameMl}</p>
                    <p className="text-xs text-muted">
                      {item.quantity} × {item.unitLabelEn} ·{" "}
                      {item.unitType === "weight"
                        ? t(
                            `ordered ${formatGrams(item.orderedQtyGrams)}`,
                            `${formatGrams(item.orderedQtyGrams, "ml")} ഓർഡർ ചെയ്തു`,
                          )
                        : null}
                      {item.finalQtyGrams != null &&
                      item.unitType === "weight" &&
                      item.finalQtyGrams !== item.orderedQtyGrams ? (
                        <span className="font-bold text-primary-700">
                          {" "}
                          →{" "}
                          {t(
                            `packed ${formatGrams(item.finalQtyGrams)}`,
                            `${formatGrams(item.finalQtyGrams, "ml")} പായ്ക്ക്`,
                          )}
                        </span>
                      ) : null}
                    </p>
                  </div>
                </div>
                <Money
                  paise={item.finalLineTotalPaise ?? item.lineTotalPaise}
                  className="text-sm font-extrabold text-primary-700"
                />
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <Card className="p-5">
          <h2 className="mb-3 text-base font-bold text-ink">{t("Bill", "ബിൽ")}</h2>
          {o.weightAdjusted ? (
            <Alert tone="warning">
              {t("Adjusted for actual packed weight.", "യഥാർത്ഥ തൂക്കമനുസരിച്ച് ക്രമീകരിച്ചു.")}
            </Alert>
          ) : null}
          <dl className="mt-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">{t("Subtotal", "ഉപമൊത്തം")}</dt>
              <dd>
                <Money paise={o.finalSubtotalPaise ?? o.subtotalPaise} className="font-bold" />
              </dd>
            </div>
            {o.discountPaise > 0 ? (
              <div className="flex justify-between text-primary-700">
                <dt>
                  {t("Coupon", "കൂപ്പൺ")} {o.couponCode}
                </dt>
                <dd>
                  - <Money paise={o.discountPaise} className="font-bold" />
                </dd>
              </div>
            ) : null}
            <div className="flex justify-between">
              <dt className="text-muted">{t("Delivery", "ഡെലിവറി")}</dt>
              <dd>
                {o.deliveryFeePaise === 0 ? (
                  <span className="font-bold text-primary-700">{t("FREE", "സൗജന്യം")}</span>
                ) : (
                  <Money paise={o.deliveryFeePaise} className="font-bold" />
                )}
              </dd>
            </div>
            {o.weightAdjusted ? (
              <div className="flex justify-between text-xs text-muted">
                <dt>{t("Original total", "യഥാർത്ഥ മൊത്തം")}</dt>
                <dd>
                  <Money paise={o.grandTotalPaise} />
                </dd>
              </div>
            ) : null}
            <div className="flex justify-between border-t border-line pt-2 text-base">
              <dt className="font-extrabold">
                {t(o.paymentMethod === "cod" ? "To pay on delivery" : "Total paid", "അടയ്ക്കേണ്ടത്")}
              </dt>
              <dd>
                <Money paise={effective} className="font-extrabold text-primary-700" />
              </dd>
            </div>
            {o.refundIssuedPaise > 0 ? (
              <div className="flex justify-between text-xs text-primary-700">
                <dt>{t("Refunded", "തിരികെ നൽകി")}</dt>
                <dd>
                  - <Money paise={o.refundIssuedPaise} className="font-bold" />
                </dd>
              </div>
            ) : null}
          </dl>

          <div className="mt-4 space-y-2">
            {o.status !== "pending_payment" && o.status !== "cancelled" ? (
              <a
                href={`${API_URL}/api/orders/${o.id}/invoice.pdf`}
                target="_blank"
                rel="noreferrer"
                className="block"
              >
                <Button variant="outline" className="w-full">
                  <Download className="h-4 w-4" aria-hidden />
                  {t("Download invoice", "ഇൻവോയ്സ് ഡൗൺലോഡ്")}
                </Button>
              </a>
            ) : null}
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => reorder.mutate()}
              loading={reorder.isPending}
              disabled={o.status === "cancelled"}
            >
              {t("Reorder in one click", "ഒറ്റ ക്ലിക്കിൽ വീണ്ടും")}
            </Button>
            {isCancellable(o.status) ? (
              <Button
                variant="danger"
                className="w-full"
                onClick={() => {
                  if (
                    window.confirm(
                      t(
                        "Cancel this order? Prepaid amounts are refunded automatically.",
                        "ഈ ഓർഡർ റദ്ദാക്കണോ? പ്രീപെയ്ഡ് തുക തിരികെ ലഭിക്കും.",
                      ),
                    )
                  ) {
                    setCancelling(true);
                    cancel.mutate("Cancelled by customer", { onSettled: () => setCancelling(false) });
                  }
                }}
                loading={cancelling}
              >
                <XCircle className="h-4 w-4" aria-hidden />
                {t("Cancel order", "ഓർഡർ റദ്ദാക്കുക")}
              </Button>
            ) : null}
          </div>
        </Card>

        <Card className="p-5 text-sm">
          <h2 className="mb-2 text-base font-bold text-ink">{t("Delivering to", "ഡെലിവറി വിലാസം")}</h2>
          <p className="font-bold text-ink">{o.address.contactName}</p>
          <p className="text-muted">
            {o.address.line1}
            {o.address.line2 ? `, ${o.address.line2}` : ""}
          </p>
          <p className="text-muted">
            {o.address.areaName}, {o.address.city} — {o.address.pincode}
          </p>
          <p className="mt-2 text-muted">📞 {o.address.contactPhone}</p>
          <p className="mt-2 text-primary-700">
            🚚 {lang === "en" ? o.slotLabelEn : o.slotLabelMl} · {o.slotDate}
          </p>
        </Card>

        <Link href="/orders" className="block text-center text-xs font-semibold text-primary-700 underline">
          {t("All orders", "എല്ലാ ഓർഡറുകളും")}
        </Link>
      </div>
    </div>
  );
}

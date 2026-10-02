"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { OrderDTO } from "@pgrs/contracts";
import { Alert, Card, Money, StatusBadge } from "@pgrs/ui";
import { api, unwrap } from "@/lib/api";
import { useUIStore } from "@/store/ui";

export function GuestOrderDetail({ id, token }: { id: string; token: string }) {
  const lang = useUIStore((s) => s.lang);
  const t = (en: string, ml: string) => (lang === "en" ? en : ml);
  const order = useQuery({
    queryKey: ["guest-order", id, token],
    enabled: Boolean(token),
    retry: false,
    refetchInterval: 15000,
    queryFn: () => unwrap<OrderDTO>(api.api.checkout.guest[":id"].$get({ param: { id }, query: { token } })),
  });
  if (!token || order.error)
    return (
      <div className="container-page py-8">
        <Alert tone="warning">
          {order.error?.message ??
            t(
              "Open the private tracking link from your order receipt.",
              "ഓർഡറിന്റെ സ്വകാര്യ ലിങ്ക് തുറക്കുക.",
            )}
        </Alert>
      </div>
    );
  if (!order.data)
    return <div className="container-page py-8">{t("Loading order…", "ലോഡ് ചെയ്യുന്നു…")}</div>;
  const data = order.data;
  return (
    <div className="container-page max-w-2xl space-y-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-extrabold">{data.orderNumber}</h1>
        <StatusBadge status={data.status} lang={lang} />
      </div>
      <Card className="space-y-3 p-5">
        {data.status === "awaiting_confirmation" ? (
          <Alert tone="info">
            {t(
              "The shop will confirm delivery charges, timing and availability on WhatsApp. The amount below is the items total.",
              "ഡെലിവറി ചാർജും സമയവും ലഭ്യതയും കട WhatsApp-ൽ സ്ഥിരീകരിക്കും.",
            )}
          </Alert>
        ) : null}
        <p className="text-sm">
          {data.slotDate} · {lang === "en" ? data.slotLabelEn : data.slotLabelMl}
        </p>
        <p className="text-sm text-muted">
          {data.address.contactName} · {data.address.line1}, {data.address.city} — {data.address.pincode}
        </p>
        <ul className="divide-y divide-line">
          {data.items.map((i) => (
            <li key={i.id} className="flex justify-between gap-3 py-3 text-sm">
              <span>
                {lang === "en" ? i.nameEn : i.nameMl} · {i.quantity} × {i.unitLabelEn}
                {i.weightAdjusted ? (
                  <span className="block text-xs text-muted">
                    {t("Packed weight", "തൂക്കം")}: {i.finalQtyGrams} g
                  </span>
                ) : null}
              </span>
              <Money paise={i.finalLineTotalPaise ?? i.lineTotalPaise} />
            </li>
          ))}
        </ul>
        <div className="flex justify-between text-sm">
          {t("Delivery", "ഡെലിവറി")}
          {data.status === "awaiting_confirmation" ? (
            t("To be confirmed", "സ്ഥിരീകരിക്കും")
          ) : (
            <Money paise={data.deliveryFeePaise} />
          )}
        </div>
        <div className="flex justify-between border-t border-line pt-3 font-bold">
          {data.status === "awaiting_confirmation"
            ? t("Items total", "സാധനങ്ങളുടെ ആകെ വില")
            : t("Final bill (COD)", "അവസാന ബിൽ")}
          <Money paise={data.finalGrandTotalPaise ?? data.grandTotalPaise} />
        </div>
        {data.status === "cancelled" ? (
          <Alert tone="warning">{data.cancellationReason ?? t("Order cancelled", "ഓർഡർ റദ്ദാക്കി")}</Alert>
        ) : null}
        {data.paymentStatus === "paid" ? (
          <p className="text-sm text-primary-700">{t("Payment collected", "പണം ലഭിച്ചു")}</p>
        ) : null}
      </Card>
      <Card className="p-5">
        <h2 className="mb-3 font-bold">{t("Order updates", "ഓർഡർ വിവരങ്ങൾ")}</h2>
        <ul className="space-y-3">
          {data.history.map((h) => (
            <li key={h.id} className="text-sm">
              <StatusBadge status={h.toStatus} lang={lang} />
              <span className="ml-2 text-xs text-muted">
                {new Date(h.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
              </span>
              <p className="mt-1 text-muted">{h.note}</p>
            </li>
          ))}
        </ul>
      </Card>
      <Link href="/orders" className="text-sm text-primary-700 underline">
        {t("Your orders on this device", "ഈ ഉപകരണത്തിലെ ഓർഡറുകൾ")}
      </Link>
    </div>
  );
}

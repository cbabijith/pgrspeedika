"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Package } from "lucide-react";
import { Button, Card, EmptyState, Money, Skeleton, StatusBadge } from "@pgrs/ui";
import { api, unwrap } from "@/lib/api";
import { useSession } from "@/lib/hooks";
import { useUIStore } from "@/store/ui";

interface OrderSummary {
  id: string;
  orderNumber: string;
  status: "pending_payment" | "confirmed" | "packed" | "out_for_delivery" | "delivered" | "cancelled";
  paymentMethod: "razorpay" | "cod";
  paymentStatus: string;
  grandTotalPaise: number;
  finalGrandTotalPaise: number | null;
  itemCount: number;
  slotDate: string;
  slotLabelEn: string;
  slotLabelMl: string;
  placedAt: string;
  firstItemImageUrl: string | null;
}

/** Order history with reorder and per-order links. */
export function OrdersList() {
  const session = useSession();
  const user = session.data?.user ?? null;
  const lang = useUIStore((s) => s.lang);
  const t = (en: string, ml: string) => (lang === "en" ? en : ml);

  const orders = useQuery({
    queryKey: ["orders"],
    enabled: Boolean(user),
    queryFn: () =>
      unwrap<{ items: OrderSummary[]; total: number }>(
        api.api.orders.$get({ query: { page: 1, pageSize: 20 } }),
      ),
  });

  if (!user) {
    return (
      <div className="container-page py-10">
        <EmptyState
          icon={<Package className="h-10 w-10" />}
          title={t("Login to see your orders", "ഓർഡറുകൾ കാണാൻ ലോഗിൻ ചെയ്യുക")}
          action={
            <Button onClick={() => (window.location.href = "/login?next=/orders")}>
              {t("Login", "ലോഗിൻ")}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="container-page space-y-4 py-6">
      <h1 className="text-2xl font-extrabold tracking-tight text-ink">
        {t("Your orders", "നിങ്ങളുടെ ഓർഡറുകൾ")}
      </h1>
      {orders.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (orders.data?.items ?? []).length === 0 ? (
        <EmptyState
          title={t("No orders yet", "ഇതുവരെ ഓർഡറുകളില്ല")}
          description={t("Your fresh groceries are a tap away.", "പുത്തൻ ഗ്രോസറികൾ ഒരു ടാപ്പ് അകലെ.")}
          action={
            <Button onClick={() => (window.location.href = "/")}>{t("Shop now", "ഷോപ്പ് ചെയ്യുക")}</Button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {(orders.data?.items ?? []).map((order) => (
            <li key={order.id}>
              <Link href={`/orders/${order.id}`}>
                <Card className="flex items-center gap-4 p-4 transition-shadow hover:shadow-lift">
                  {order.firstItemImageUrl ? (
                    <img src={order.firstItemImageUrl} alt="" className="h-14 w-14 rounded-xl object-cover" />
                  ) : null}
                  <div className="flex-1">
                    <p className="text-sm font-extrabold text-ink">{order.orderNumber}</p>
                    <p className="text-xs text-muted">
                      {new Date(order.placedAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                      })}{" "}
                      · {order.itemCount} {t("items", "ഇനങ്ങൾ")} ·{" "}
                      {lang === "en" ? order.slotLabelEn : order.slotLabelMl}
                    </p>
                  </div>
                  <StatusBadge status={order.status} lang={lang} />
                  <Money
                    paise={order.finalGrandTotalPaise ?? order.grandTotalPaise}
                    className="text-sm font-extrabold text-primary-700"
                  />
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

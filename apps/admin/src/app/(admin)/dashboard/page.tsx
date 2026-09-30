"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, IndianRupee, Package, UserPlus } from "lucide-react";
import { Alert, BarChart, Card, Money, Skeleton } from "@pgrs/ui";
import { formatINR } from "@pgrs/contracts";
import { api, unwrap } from "@/lib/api";

interface DashboardData {
  date: string;
  ordersByStatus: {
    confirmed: number;
    packed: number;
    outForDelivery: number;
    delivered: number;
    cancelled: number;
    pendingPayment: number;
  };
  revenue: { todayRevenuePaise: number; monthRevenuePaise: number };
  newCustomers: number;
  lowStock: Array<{
    productId: string;
    nameEn: string;
    sellingType: string;
    available: number;
    lowStockThreshold: number;
  }>;
  slotUtilization: Array<{ slotId: string; name: string; capacity: number; booked: number }>;
  salesTrend: Array<{ date: string; revenuePaise: number; orderCount: number }>;
}

export default function DashboardPage() {
  const dashboard = useQuery({
    queryKey: ["dashboard"],
    refetchInterval: 30_000,
    queryFn: () => unwrap<DashboardData>(api.api.admin.dashboard.$get({ query: {} })),
  });

  if (dashboard.isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    );
  }
  const d = dashboard.data;
  if (!d) return <Alert tone="danger">Could not load the dashboard.</Alert>;

  const statusCards = [
    { label: "To pack", value: d.ordersByStatus.confirmed, tone: "amber" as const },
    { label: "Packed", value: d.ordersByStatus.packed, tone: "green" as const },
    { label: "Out for delivery", value: d.ordersByStatus.outForDelivery, tone: "amber" as const },
    { label: "Delivered today", value: d.ordersByStatus.delivered, tone: "green" as const },
  ];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-extrabold tracking-tight text-ink">Today at a glance</h1>
        <p className="text-sm text-muted">
          {new Date(d.date).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statusCards.map((card) => (
          <Card key={card.label} className="flex items-center gap-4 p-4">
            <span
              className={
                card.tone === "amber"
                  ? "flex h-11 w-11 items-center justify-center rounded-full bg-accent-surface text-amber-700"
                  : "flex h-11 w-11 items-center justify-center rounded-full bg-primary-surface text-primary-700"
              }
            >
              <Package className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <p className="text-2xl font-extrabold tabular-nums text-ink">{card.value}</p>
              <p className="text-xs font-semibold text-muted">{card.label}</p>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <div className="flex items-center gap-2 text-muted">
            <IndianRupee className="h-4 w-4" aria-hidden />
            <p className="text-xs font-bold uppercase tracking-wide">Revenue today</p>
          </div>
          <p className="mt-1 text-2xl font-extrabold text-primary-700">
            <Money paise={d.revenue.todayRevenuePaise} />
          </p>
          <p className="mt-1 text-xs text-muted">
            30 days: <Money paise={d.revenue.monthRevenuePaise} />
          </p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 text-muted">
            <UserPlus className="h-4 w-4" aria-hidden />
            <p className="text-xs font-bold uppercase tracking-wide">New customers (24h)</p>
          </div>
          <p className="mt-1 text-2xl font-extrabold text-ink">{d.newCustomers}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Slot utilization</p>
          <ul className="mt-2 space-y-2">
            {d.slotUtilization.map((s) => {
              const pct = Math.min(100, Math.round((s.booked / Math.max(1, s.capacity)) * 100));
              return (
                <li key={s.slotId}>
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-ink">{s.name}</span>
                    <span className="text-muted">
                      {s.booked}/{s.capacity}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                    <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <p className="mb-4 text-xs font-bold uppercase tracking-wide text-muted">Sales trend (14 days)</p>
          <BarChart
            data={d.salesTrend.map((t) => ({ label: t.date.slice(5), value: t.revenuePaise }))}
            formatValue={(v) => formatINR(v)}
          />
        </Card>
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden />
            <p className="text-xs font-bold uppercase tracking-wide text-muted">Low stock</p>
          </div>
          {d.lowStock.length === 0 ? (
            <p className="text-sm text-muted">All good — nothing below threshold.</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {d.lowStock.map((item) => (
                <li key={item.productId} className="flex items-center justify-between py-2">
                  <span className="font-semibold text-ink">{item.nameEn}</span>
                  <span className="text-xs font-bold text-danger">
                    {item.sellingType === "loose"
                      ? `${(item.available / 1000).toFixed(1)} kg left`
                      : `${item.available} units left`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

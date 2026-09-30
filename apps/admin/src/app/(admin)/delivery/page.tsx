"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Badge, Button, Card, Money, Skeleton } from "@pgrs/ui";
import { api, unwrap } from "@/lib/api";

interface RouteOrder {
  id: string;
  orderNumber: string;
  status: string;
  pincode: string;
  areaName: { areaName: string; contactName: string; contactPhone: string; line1: string };
  slotLabel: string;
  slotDate: string;
  grandTotalPaise: number;
  finalGrandTotalPaise: number;
  paymentMethod: "razorpay" | "cod";
  paymentStatus: string;
  assignedTo: string | null;
  assignedToName: string | null;
}

/** Delivery routes grouped by area, with COD amounts to collect. */
export default function DeliveryPage() {
  const routes = useQuery({
    queryKey: ["admin-routes"],
    refetchInterval: 30_000,
    queryFn: () =>
      unwrap<{ date: string | null; groups: Array<[string, RouteOrder[]]> }>(
        api.api.admin.delivery.routes.$get({ query: {} }),
      ),
  });

  if (routes.isLoading) return <Skeleton className="h-64 w-full" />;

  const groups = routes.data?.groups ?? [];
  const codTotal = groups
    .flatMap(([, orders]) => orders)
    .filter((o) => o.paymentMethod === "cod" && o.paymentStatus !== "paid")
    .reduce((sum, o) => sum + (o.finalGrandTotalPaise ?? o.grandTotalPaise), 0);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-extrabold tracking-tight text-ink">Delivery routes</h1>
        <Badge tone="amber">
          COD to collect: <Money paise={codTotal} />
        </Badge>
      </header>

      {groups.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted">
          No packed or out-for-delivery orders right now.
        </Card>
      ) : (
        groups.map(([area, orders]) => (
          <Card key={area} className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold text-ink">{area}</h2>
              <Badge tone="outline">{orders.length} order(s)</Badge>
            </div>
            <ul className="divide-y divide-line">
              {orders.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center gap-3 py-2.5">
                  <Link
                    href={`/orders/${o.id}`}
                    className="text-sm font-extrabold text-primary-700 hover:underline"
                  >
                    {o.orderNumber}
                  </Link>
                  <span className="text-xs text-muted">
                    {o.areaName.contactName} · {o.areaName.contactPhone} · {o.areaName.line1}
                  </span>
                  <span className="text-xs text-muted">
                    {o.slotLabel} · {o.slotDate}
                  </span>
                  {o.assignedToName ? (
                    <Badge tone="green">👤 {o.assignedToName}</Badge>
                  ) : (
                    <Badge tone="red">Unassigned</Badge>
                  )}
                  {o.paymentMethod === "cod" && o.paymentStatus !== "paid" ? (
                    <Badge tone="amber">
                      COD <Money paise={o.finalGrandTotalPaise ?? o.grandTotalPaise} />
                    </Badge>
                  ) : (
                    <Badge tone="green">Prepaid</Badge>
                  )}
                  <span className="ml-auto">
                    <Link href={`/orders/${o.id}`}>
                      <Button size="sm" variant="outline">
                        {o.status === "packed" ? "Send out" : "Mark delivered"}
                      </Button>
                    </Link>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ))
      )}
    </div>
  );
}

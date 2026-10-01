"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { KanbanSquare, Table2 } from "lucide-react";
import {
  Badge,
  Button,
  Input,
  Money,
  Select,
  StatusBadge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@pgrs/ui";
import type { OrderStatus } from "@pgrs/contracts";
import { api, unwrap } from "@/lib/api";

interface OrderRow {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  source: string;
  paymentMethod: "razorpay" | "cod";
  paymentStatus: string;
  grandTotalPaise: number;
  finalGrandTotalPaise: number | null;
  itemCount: number;
  slotDate: string;
  slotLabelEn: string;
  placedAt: string;
  firstItemImageUrl: string | null;
}

const COLUMNS: Array<{ status: OrderStatus; title: string }> = [
  { status: "confirmed", title: "To pack" },
  { status: "packed", title: "Packed" },
  { status: "out_for_delivery", title: "Out for delivery" },
  { status: "delivered", title: "Delivered" },
];

export default function OrdersPage() {
  const [status, setStatus] = useState<string>("");
  const [source, setSource] = useState<string>("");
  const [date, setDate] = useState("");
  const [q, setQ] = useState("");

  const orders = useQuery({
    queryKey: ["admin-orders", status, date, q, source],
    refetchInterval: 20_000,
    queryFn: () =>
      unwrap<{ items: OrderRow[]; total: number }>(
        api.api.admin.orders.$get({
          query: {
            page: 1,
            pageSize: 100,
            ...(status ? { status: status as OrderStatus } : {}),
            ...(date ? { date } : {}),
            ...(q ? { q } : {}),
            ...(source ? { source: source as "web" | "whatsapp" } : {}),
          },
        }),
      ),
  });

  const items = orders.data?.items ?? [];
  const byStatus = useMemo(() => {
    const map = new Map<string, OrderRow[]>();
    for (const item of items) {
      const list = map.get(item.status) ?? [];
      list.push(item);
      map.set(item.status, list);
    }
    return map;
  }, [items]);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-extrabold tracking-tight text-ink">Orders</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-44 py-1.5 text-xs">
            <option value="">All statuses</option>
            {["pending_payment", "confirmed", "packed", "out_for_delivery", "delivered", "cancelled"].map(
              (s) => (
                <option key={s} value={s}>
                  {s.replaceAll("_", " ")}
                </option>
              ),
            )}
          </Select>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-40 py-1.5 text-xs"
            aria-label="Filter by slot date"
          />
          <Select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="w-36 py-1.5 text-xs"
            aria-label="Filter by source"
          >
            <option value="">All sources</option>
            <option value="web">Web</option>
            <option value="whatsapp">WhatsApp</option>
          </Select>
          <Input
            placeholder="order #, name, phone"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-52 py-1.5 text-xs"
            aria-label="Search orders"
          />
        </div>
      </header>

      <Tabs defaultValue="kanban">
        <TabsList>
          <TabsTrigger value="kanban">
            <span className="inline-flex items-center gap-1.5">
              <KanbanSquare className="h-3.5 w-3.5" aria-hidden /> Board
            </span>
          </TabsTrigger>
          <TabsTrigger value="table">
            <span className="inline-flex items-center gap-1.5">
              <Table2 className="h-3.5 w-3.5" aria-hidden /> Table
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="kanban">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {COLUMNS.map((col) => (
              <section
                key={col.status}
                aria-label={col.title}
                className="rounded-card bg-white p-3 shadow-card"
              >
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-bold text-ink">{col.title}</p>
                  <Badge tone="outline">{byStatus.get(col.status)?.length ?? 0}</Badge>
                </div>
                <div className="space-y-2">
                  {(byStatus.get(col.status) ?? []).map((o) => (
                    <Link
                      key={o.id}
                      href={`/orders/${o.id}`}
                      className="block rounded-xl border border-line p-3 transition-colors hover:border-primary-300 hover:bg-primary-50"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-extrabold text-ink">{o.orderNumber}</p>
                        <Money
                          paise={o.finalGrandTotalPaise ?? o.grandTotalPaise}
                          className="text-xs font-bold text-primary-700"
                        />
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        {o.itemCount} items · {o.slotLabelEn}
                      </p>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        {o.paymentMethod === "cod" ? (
                          <Badge tone="amber">COD</Badge>
                        ) : (
                          <Badge tone="green">Paid</Badge>
                        )}
                        {o.paymentStatus === "pending" && o.paymentMethod === "razorpay" ? (
                          <Badge tone="red">Unpaid</Badge>
                        ) : null}
                      </div>
                    </Link>
                  ))}
                  {(byStatus.get(col.status)?.length ?? 0) === 0 ? (
                    <p className="py-6 text-center text-xs text-muted">—</p>
                  ) : null}
                </div>
              </section>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="table">
          <div className="overflow-x-auto rounded-card border border-line bg-white shadow-card">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Source</th>
                  <th>Placed</th>
                  <th>Slot</th>
                  <th>Items</th>
                  <th>Payment</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((o) => (
                  <tr key={o.id}>
                    <td className="font-bold text-ink">{o.orderNumber}</td>
                    <td className="text-muted">
                      {new Date(o.placedAt).toLocaleString("en-IN", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </td>
                    <td className="text-muted">
                      {o.slotLabelEn} · {o.slotDate}
                    </td>
                    <td className="tabular-nums">{o.itemCount}</td>
                    <td>
                      {o.paymentMethod === "cod" ? (
                        <Badge tone="amber">COD {o.paymentStatus === "paid" ? "✓" : ""}</Badge>
                      ) : (
                        <Badge tone="green">{o.paymentStatus === "paid" ? "Paid" : o.paymentStatus}</Badge>
                      )}
                    </td>
                    <td>
                      <Money paise={o.finalGrandTotalPaise ?? o.grandTotalPaise} className="font-bold" />
                    </td>
                    <td>
                      <StatusBadge status={o.status} />
                    </td>
                    <td>
                      <Link href={`/orders/${o.id}`}>
                        <Button size="sm" variant="outline">
                          Open
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

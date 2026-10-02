"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Download, Package, Truck, XCircle } from "lucide-react";
import { Alert, Badge, Button, Card, Field, Input, Money, Select, StatusBadge } from "@pgrs/ui";
import { formatGrams, isCancellable, type OrderDTO } from "@pgrs/contracts";
import { API_URL, api, unwrap } from "@/lib/api";

/** Order detail: timeline, packing with actual weights, delivery + refunds. */
export default function AdminOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const queryClient = useQueryClient();
  const [weights, setWeights] = useState<Record<string, string>>({});
  const [refundAmount, setRefundAmount] = useState("");
  const [assignee, setAssignee] = useState("");
  const [deliveryFee, setDeliveryFee] = useState("0");
  const [deliveryDate, setDeliveryDate] = useState(() =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()),
  );
  const [deliveryNote, setDeliveryNote] = useState("");

  const order = useQuery({
    queryKey: ["admin-order", id],
    refetchInterval: 20_000,
    queryFn: () => unwrap<OrderDTO>(api.api.admin.orders[":id"].$get({ param: { id } })),
  });
  const staff = useQuery({
    queryKey: ["admin-staff"],
    queryFn: () =>
      unwrap<Array<{ id: string; name: string; role: string }>>(api.api.admin.staff.$get({ query: {} })),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-order", id] });
    queryClient.invalidateQueries({ queryKey: ["admin-orders"] });
  };

  const pack = useMutation({
    mutationFn: async () => {
      const items = (order.data?.items ?? []).map((item) => ({
        itemId: item.id,
        finalQtyGrams:
          item.unitType === "weight"
            ? Number(weights[item.id] ?? item.orderedQtyGrams) || item.orderedQtyGrams
            : item.quantity,
      }));
      await unwrap(api.api.admin.orders[":id"].pack.$post({ param: { id }, json: { items } as never }));
    },
    onSuccess: () => {
      toast.success("Order packed — bill adjusted to actual weights");
      invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const confirm = useMutation({
    mutationFn: async () => {
      const fee = Number(deliveryFee);
      if (!Number.isFinite(fee) || fee < 0 || fee > 1000 || deliveryNote.trim().length < 2)
        throw new Error("Enter a valid delivery charge and agreed timing");
      return unwrap(
        api.api.admin.orders[":id"].confirm.$post({
          param: { id },
          json: { deliveryFeePaise: Math.round(fee * 100), deliveryDate, deliveryNote },
        }),
      );
    },
    onSuccess: () => {
      toast.success("Order confirmed — stock reserved");
      invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const transition = useMutation({
    mutationFn: async (to: string) => {
      await unwrap(api.api.admin.orders[":id"].status.$post({ param: { id }, json: { to } as never }));
    },
    onSuccess: () => {
      toast.success("Status updated");
      invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const cancel = useMutation({
    mutationFn: async (reason: string) => {
      await unwrap(api.api.admin.orders[":id"].cancel.$post({ param: { id }, json: { reason } }));
    },
    onSuccess: () => {
      toast.success("Order cancelled");
      invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const assign = useMutation({
    mutationFn: async (userId: string | null) => {
      await unwrap(api.api.admin.orders[":id"].assign.$post({ param: { id }, json: { userId } as never }));
    },
    onSuccess: () => {
      toast.success("Assigned");
      invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const refund = useMutation({
    mutationFn: async () => {
      const amount = Math.round(Number(refundAmount) * 100);
      await unwrap(
        api.api.admin.orders[":id"].refund.$post({
          param: { id },
          json: { amountPaise: amount, reason: "Manual refund by shop" } as never,
        }),
      );
    },
    onSuccess: () => {
      toast.success("Refund initiated");
      setRefundAmount("");
      invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const collectCod = useMutation({
    mutationFn: async () => {
      const o = order.data;
      const amount = o?.finalGrandTotalPaise ?? o?.grandTotalPaise ?? 0;
      await unwrap(
        api.api.admin.orders[":id"]["cod-collect"].$post({
          param: { id },
          json: { amountPaise: amount } as never,
        }),
      );
    },
    onSuccess: () => {
      toast.success("Cash collection recorded");
      invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  if (order.isLoading) return <p className="text-sm text-muted">Loading order…</p>;
  if (!order.data) return <Alert tone="danger">Order not found.</Alert>;
  const o = order.data;
  const effective = o.finalGrandTotalPaise ?? o.grandTotalPaise;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/orders" aria-label="Back to orders">
            <Button size="icon" variant="outline">
              <ArrowLeft className="h-4 w-4" aria-hidden />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-ink">{o.orderNumber}</h1>
            <p className="text-xs text-muted">
              {new Date(o.placedAt).toLocaleString("en-IN")} · {o.slotLabelEn} · {o.slotDate} ·{" "}
              {o.address.areaName} {o.address.pincode}
            </p>
          </div>
        </div>
        <StatusBadge status={o.status} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {o.status === "awaiting_confirmation" ? (
            <Card className="space-y-3 p-5">
              <h2 className="font-bold">Confirm WhatsApp request</h2>
              <p className="text-sm text-muted">
                Agree the delivery charge and timing with the customer, then confirm. Stock is reserved only
                when you confirm.
              </p>
              <a
                href={`https://wa.me/${o.address.contactPhone.replace(/\D/g, "")}?text=${encodeURIComponent(`Regarding your order ${o.orderNumber} at PGRS Peedika`)}`}
                target="_blank"
                rel="noreferrer"
                className="block font-semibold text-primary-700 underline"
              >
                Chat with customer on WhatsApp
              </a>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Delivery charge (₹)">
                  <Input
                    type="number"
                    min="0"
                    max="1000"
                    step="0.01"
                    value={deliveryFee}
                    onChange={(e) => setDeliveryFee(e.target.value)}
                  />
                </Field>
                <Field label="Delivery date">
                  <Input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
                </Field>
                <Field label="Agreed delivery timing" className="sm:col-span-2">
                  <Input
                    placeholder="e.g. Between 5 PM and 7 PM"
                    maxLength={120}
                    value={deliveryNote}
                    onChange={(e) => setDeliveryNote(e.target.value)}
                  />
                </Field>
              </div>
              <Button className="w-full" onClick={() => confirm.mutate()} loading={confirm.isPending}>
                Confirm order and reserve stock
              </Button>
            </Card>
          ) : null}
          {/* Packing */}
          {o.status === "confirmed" ? (
            <Card className="p-5">
              <h2 className="mb-1 flex items-center gap-2 text-base font-bold text-ink">
                <Package className="h-4 w-4 text-primary-700" aria-hidden /> Packing
              </h2>
              <p className="mb-3 text-xs text-muted">
                Enter the actual weight you packed for loose items; packaged items are fixed. The bill
                recalculates when you save.
              </p>
              <div className="space-y-2">
                {o.items.map((item) => (
                  <div key={item.id} className="flex flex-wrap items-center gap-3 border-b border-line pb-2">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt="" className="h-10 w-10 rounded-lg object-cover" />
                    ) : null}
                    <div className="min-w-40 flex-1">
                      <p className="text-sm font-bold text-ink">{item.nameEn}</p>
                      <p className="text-xs text-muted">
                        ordered {item.quantity} × {item.unitLabelEn}
                        {item.unitType === "weight" ? ` (${formatGrams(item.orderedQtyGrams)})` : ""}
                      </p>
                    </div>
                    {item.unitType === "weight" ? (
                      <div className="w-40">
                        <Field label="Packed grams">
                          <Input
                            inputMode="numeric"
                            className="py-1.5"
                            value={weights[item.id] ?? String(item.orderedQtyGrams)}
                            onChange={(e) =>
                              setWeights((prev) => ({
                                ...prev,
                                [item.id]: e.target.value.replace(/\D/g, ""),
                              }))
                            }
                          />
                        </Field>
                      </div>
                    ) : (
                      <Badge tone="outline">fixed unit</Badge>
                    )}
                    <Money paise={item.lineTotalPaise} className="text-sm font-bold" />
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button onClick={() => pack.mutate()} loading={pack.isPending}>
                  Mark packed & recalculate bill
                </Button>
                <a href={`${API_URL}/api/admin/orders/${o.id}/slip.pdf`} target="_blank" rel="noreferrer">
                  <Button variant="outline">
                    <Download className="h-4 w-4" aria-hidden /> Packing slip
                  </Button>
                </a>
              </div>
            </Card>
          ) : null}

          {/* Items */}
          <Card className="p-5">
            <h2 className="mb-3 text-base font-bold text-ink">Items ({o.items.length})</h2>
            <ul className="divide-y divide-line">
              {o.items.map((item) => (
                <li key={item.id} className="flex items-start justify-between gap-3 py-2.5">
                  <div>
                    <p className="text-sm font-bold text-ink">{item.nameEn}</p>
                    <p className="text-xs text-muted">
                      {item.quantity} × {item.unitLabelEn} · HSN {item.hsnCode || "—"} · GST {item.gstRate}%
                      {item.finalQtyGrams != null && item.unitType === "weight" ? (
                        <> · packed {formatGrams(item.finalQtyGrams)}</>
                      ) : null}
                    </p>
                  </div>
                  <Money
                    paise={item.finalLineTotalPaise ?? item.lineTotalPaise}
                    className="text-sm font-bold text-primary-700"
                  />
                </li>
              ))}
            </ul>
          </Card>

          {/* Timeline */}
          <Card className="p-5">
            <h2 className="mb-3 text-base font-bold text-ink">History</h2>
            <ol className="space-y-2 text-sm">
              {o.history.map((h) => (
                <li key={h.id} className="flex flex-wrap justify-between gap-3 border-b border-line pb-1.5">
                  <span className="font-semibold text-ink">
                    {h.fromStatus ? `${h.fromStatus} → ` : ""}
                    {h.toStatus}
                    {h.note ? <span className="font-normal text-muted"> · {h.note}</span> : null}
                  </span>
                  <span className="whitespace-nowrap text-xs text-muted">
                    {new Date(h.createdAt).toLocaleString("en-IN", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        {/* Side actions */}
        <div className="order-first space-y-4 lg:order-last">
          <Card className="space-y-2 p-5">
            <h2 className="text-base font-bold text-ink">Bill</h2>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Subtotal</dt>
                <dd>
                  <Money paise={o.finalSubtotalPaise ?? o.subtotalPaise} className="font-bold" />
                </dd>
              </div>
              {o.discountPaise > 0 ? (
                <div className="flex justify-between text-primary-700">
                  <dt>Coupon {o.couponCode}</dt>
                  <dd>
                    - <Money paise={o.discountPaise} className="font-bold" />
                  </dd>
                </div>
              ) : null}
              <div className="flex justify-between">
                <dt className="text-muted">Delivery</dt>
                <dd>
                  {o.status === "awaiting_confirmation" ? (
                    "To be confirmed"
                  ) : (
                    <Money paise={o.deliveryFeePaise} className="font-bold" />
                  )}
                </dd>
              </div>
              <div className="flex justify-between border-t border-line pt-1.5">
                <dt className="font-extrabold">Total</dt>
                <dd>
                  <Money paise={effective} className="font-extrabold text-primary-700" />
                </dd>
              </div>
              {o.refundIssuedPaise > 0 ? (
                <div className="flex justify-between text-xs text-primary-700">
                  <dt>Refunded</dt>
                  <dd>
                    <Money paise={o.refundIssuedPaise} className="font-bold" />
                  </dd>
                </div>
              ) : null}
            </dl>
            <a href={`${API_URL}/api/admin/orders/${o.id}/invoice.pdf`} target="_blank" rel="noreferrer">
              <Button variant="outline" className="w-full">
                <Download className="h-4 w-4" aria-hidden /> Invoice PDF
              </Button>
            </a>
          </Card>

          <Card className="space-y-3 p-5">
            <h2 className="flex items-center gap-2 text-base font-bold text-ink">
              <Truck className="h-4 w-4 text-primary-700" aria-hidden /> Fulfilment
            </h2>
            <Field label="Assign rider / packer">
              <div className="flex gap-2">
                <Select
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                  className="min-w-0 flex-1"
                >
                  <option value="">— select staff —</option>
                  {(staff.data ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.role})
                    </option>
                  ))}
                </Select>
                <Button variant="secondary" onClick={() => assign.mutate(assignee || null)}>
                  Assign
                </Button>
              </div>
            </Field>
            {o.assignedToName ? (
              <p className="text-xs text-muted">
                Currently assigned: <strong>{o.assignedToName}</strong>
              </p>
            ) : null}

            {o.status === "packed" ? (
              <Button
                className="w-full"
                onClick={() => transition.mutate("out_for_delivery")}
                loading={transition.isPending}
              >
                Send out for delivery
              </Button>
            ) : null}
            {o.status === "out_for_delivery" ? (
              <Button
                className="w-full"
                onClick={() => transition.mutate("delivered")}
                loading={transition.isPending}
              >
                Mark delivered
              </Button>
            ) : null}
            {o.status === "out_for_delivery" && o.paymentMethod === "cod" && o.paymentStatus !== "paid" ? (
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => collectCod.mutate()}
                loading={collectCod.isPending}
              >
                Record cash collected (<Money paise={effective} />)
              </Button>
            ) : null}
            {isCancellable(o.status) ? (
              <Button
                variant="danger"
                className="w-full"
                onClick={() => {
                  const reason = window.prompt("Cancellation reason?");
                  if (reason) cancel.mutate(reason);
                }}
                loading={cancel.isPending}
              >
                <XCircle className="h-4 w-4" aria-hidden /> Cancel order
              </Button>
            ) : null}
          </Card>

          {o.paymentStatus === "paid" || o.paymentStatus === "partially_refunded" ? (
            <Card className="space-y-2 p-5">
              <h2 className="text-base font-bold text-ink">Refund</h2>
              <Field label="Amount (₹)">
                <Input
                  inputMode="decimal"
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  placeholder="e.g. 25.00"
                />
              </Field>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => refund.mutate()}
                loading={refund.isPending}
              >
                Issue refund
              </Button>
              {o.refunds.length > 0 ? (
                <ul className="space-y-1 text-xs text-muted">
                  {o.refunds.map((r) => (
                    <li key={r.id}>
                      <Money paise={r.amountPaise} /> · {r.status} · {r.reason}
                    </li>
                  ))}
                </ul>
              ) : null}
            </Card>
          ) : null}

          <Card className="p-5 text-sm">
            <h2 className="mb-2 text-base font-bold text-ink">Customer</h2>
            <p className="font-bold text-ink">{o.address.contactName}</p>
            <p className="text-muted">📞 {o.address.contactPhone}</p>
            <p className="text-muted">
              {o.address.line1}
              {o.address.line2 ? `, ${o.address.line2}` : ""}
            </p>
            <p className="text-muted">
              {o.address.areaName}, {o.address.city} — {o.address.pincode}
            </p>
            {o.customerNote ? <p className="mt-2 text-xs italic text-muted">“{o.customerNote}”</p> : null}
          </Card>
        </div>
      </div>
    </div>
  );
}

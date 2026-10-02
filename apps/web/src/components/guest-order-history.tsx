"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, EmptyState, Money } from "@pgrs/ui";
import type { GuestReceipt } from "./guest-checkout";

export function GuestOrderHistory() {
  const [orders, setOrders] = useState<GuestReceipt[]>([]);
  useEffect(() => {
    try {
      setOrders(JSON.parse(localStorage.getItem("pgrs-guest-orders") ?? "[]"));
    } catch {
      /* No browser history. */
    }
  }, []);
  return (
    <div className="container-page space-y-4 py-8">
      <h1 className="text-xl font-extrabold">Your guest orders</h1>
      <p className="text-sm text-muted">
        Orders placed on this device. Open an order to see its delivery status and final bill.
      </p>
      {orders.length ? (
        <ul className="space-y-3">
          {orders.map((o) => (
            <li key={o.orderId}>
              <Link href={`/guest-orders/${o.orderId}?token=${o.guestToken}`}>
                <Card className="flex justify-between gap-3 p-4">
                  <span className="font-bold">{o.orderNumber}</span>
                  <Money paise={o.grandTotalPaise} />
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="No guest orders on this device" action={<Link href="/">Shop groceries</Link>} />
      )}
    </div>
  );
}

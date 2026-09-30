import { and, eq, inArray, sql } from "drizzle-orm";
import { EVENT_SCHEMAS, EVENTS } from "@pgrs/events";
import type { EventName, EventPayloadMap } from "@pgrs/events";
import { formatINR } from "@pgrs/contracts";
import { notifications, orders, settings, user } from "@pgrs/db";
import type { AppContext } from "../lib/app-context";
import { log } from "../lib/app-context";
import { childLogger } from "../lib/logger";

type Handler<K extends EventName> = (payload: EventPayloadMap[K], ctx: AppContext) => Promise<void>;
type AnyHandler = (payload: never, ctx: AppContext) => Promise<void>;

const handlers = new Map<EventName, AnyHandler>();

function register<K extends EventName>(name: K, handler: Handler<K>) {
  handlers.set(name, handler as unknown as AnyHandler);
}

/** Deduped in-app notification insert (handlers must stay idempotent). */
async function pushInApp(
  ctx: AppContext,
  input: {
    userId: string | null;
    title: string;
    body: string;
    eventName: string;
    relatedType?: string;
    relatedId?: string;
  },
) {
  if (input.userId) {
    const existing = await ctx.db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, input.userId),
          eq(notifications.eventName, input.eventName),
          input.relatedId ? eq(notifications.relatedId, input.relatedId) : sql`true`,
        ),
      )
      .limit(1);
    if (existing.length > 0) return;
  }
  await ctx.db.insert(notifications).values({
    userId: input.userId,
    channel: "inapp",
    eventName: input.eventName,
    title: input.title,
    body: input.body,
    status: "sent",
    sentAt: new Date(),
    relatedType: input.relatedType ?? null,
    relatedId: input.relatedId ?? null,
  });
}

/** Best-effort outbound SMS/WhatsApp through the configured provider. */
async function sendSms(
  ctx: AppContext,
  to: string,
  title: string,
  body: string,
  eventName: string,
  relatedId?: string,
) {
  try {
    const result = await ctx.notifier.send({
      channel: "sms",
      to,
      title,
      body,
      eventName,
      relatedId,
    });
    await ctx.db.insert(notifications).values({
      userId: null,
      channel: "sms",
      eventName,
      title,
      body,
      status: "sent",
      providerMessageId: result.providerMessageId,
      relatedId: relatedId ?? null,
      sentAt: new Date(),
    });
  } catch (err) {
    log("worker").warn({ err: String(err), eventName }, "SMS delivery failed");
  }
}

/** Increment a counter inside the analytics.counters settings JSON. */
async function bumpCounter(ctx: AppContext, key: string, by = 1) {
  await ctx.db
    .insert(settings)
    .values({ key: "analytics.counters", value: { [key]: by } })
    .onConflictDoUpdate({
      target: settings.key,
      set: {
        value: sql`jsonb_set(
          ${settings.value},
          ARRAY[${key}]::text[],
          to_jsonb(coalesce((${settings.value} ->> ${key})::int, 0) + ${by})
        )`,
        updatedAt: new Date(),
      },
    });
}

async function staffUserIds(ctx: AppContext): Promise<string[]> {
  const rows = await ctx.db
    .select({ id: user.id })
    .from(user)
    .where(inArray(user.role, ["owner", "manager"]));
  return rows.map((r) => r.id);
}

async function customerTemplate(ctx: AppContext, key: string): Promise<string | null> {
  const [row] = await ctx.db.select().from(settings).where(eq(settings.key, "notification.templates"));
  if (!row) return null;
  const templates = row.value as Record<string, string>;
  return templates[key] ?? null;
}

function render(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? "");
}

// ── Handlers (each must be idempotent: events may be redelivered) ────────────

register(EVENTS.orderPlaced, async (payload, ctx) => {
  await bumpCounter(ctx, "ordersPlaced");

  const staff = await staffUserIds(ctx);
  for (const staffId of staff) {
    await pushInApp(ctx, {
      userId: staffId,
      title: `New order ${payload.orderNumber}`,
      body: `${payload.items.length} items · ${formatINR(payload.grandTotalPaise)} · ${payload.pincode} · ${payload.slotDate}`,
      eventName: EVENTS.orderPlaced,
      relatedType: "order",
      relatedId: payload.orderId,
    });
  }
  const template = await customerTemplate(ctx, "orderPlaced");
  if (template) {
    await sendSms(
      ctx,
      payload.customerPhone,
      "Order received",
      render(template, {
        orderNumber: payload.orderNumber,
        total: formatINR(payload.grandTotalPaise),
        slot: payload.slotDate,
      }),
      EVENTS.orderPlaced,
      payload.orderId,
    );
  }
});

register(EVENTS.orderConfirmed, async (payload, ctx) => {
  if (payload.userId) {
    await pushInApp(ctx, {
      userId: payload.userId,
      title: `Order ${payload.orderNumber} confirmed`,
      body: payload.note ?? "Your order is confirmed and will be packed fresh.",
      eventName: EVENTS.orderConfirmed,
      relatedType: "order",
      relatedId: payload.orderId,
    });
  }
});

register(EVENTS.orderPacked, async (payload, ctx) => {
  const finalTotal = payload.finalGrandTotalPaise ?? payload.grandTotalPaise;
  const parts: string[] = [`Final bill ${formatINR(finalTotal)}.`];
  if (payload.refundDuePaise > 0) parts.push(`${formatINR(payload.refundDuePaise)} will be refunded.`);
  if (payload.collectDuePaise > 0) parts.push(`Keep ${formatINR(payload.collectDuePaise)} ready (COD).`);
  if (payload.userId) {
    await pushInApp(ctx, {
      userId: payload.userId,
      title: `Order ${payload.orderNumber} packed`,
      body: parts.join(" "),
      eventName: EVENTS.orderPacked,
      relatedType: "order",
      relatedId: payload.orderId,
    });
  }
  if (payload.customerPhone) {
    await sendSms(
      ctx,
      payload.customerPhone,
      "Order packed",
      parts.join(" "),
      EVENTS.orderPacked,
      payload.orderId,
    );
  }
});

register(EVENTS.orderOutForDelivery, async (payload, ctx) => {
  if (payload.userId) {
    await pushInApp(ctx, {
      userId: payload.userId,
      title: `Order ${payload.orderNumber} out for delivery`,
      body: "Your order is on the way!",
      eventName: EVENTS.orderOutForDelivery,
      relatedType: "order",
      relatedId: payload.orderId,
    });
  }
  const template = await customerTemplate(ctx, "outForDelivery");
  if (template && payload.customerPhone) {
    await sendSms(
      ctx,
      payload.customerPhone,
      "Out for delivery",
      render(template, {
        orderNumber: payload.orderNumber,
        total: formatINR(payload.grandTotalPaise),
      }),
      EVENTS.orderOutForDelivery,
      payload.orderId,
    );
  }
});

register(EVENTS.orderDelivered, async (payload, ctx) => {
  if (payload.userId) {
    await pushInApp(ctx, {
      userId: payload.userId,
      title: `Order ${payload.orderNumber} delivered`,
      body: "Thank you for shopping at PGRS Peedika!",
      eventName: EVENTS.orderDelivered,
      relatedType: "order",
      relatedId: payload.orderId,
    });
  }
  const template = await customerTemplate(ctx, "delivered");
  if (template && payload.customerPhone) {
    await sendSms(
      ctx,
      payload.customerPhone,
      "Delivered",
      render(template, { orderNumber: payload.orderNumber, total: formatINR(payload.grandTotalPaise) }),
      EVENTS.orderDelivered,
      payload.orderId,
    );
  }
});

register(EVENTS.orderCancelled, async (payload, ctx) => {
  if (payload.userId) {
    await pushInApp(ctx, {
      userId: payload.userId,
      title: `Order ${payload.orderNumber} cancelled`,
      body: payload.note ?? "Your order was cancelled.",
      eventName: EVENTS.orderCancelled,
      relatedType: "order",
      relatedId: payload.orderId,
    });
  }
});

register(EVENTS.paymentCaptured, async (payload, ctx) => {
  const [order] = await ctx.db
    .select({ userId: orders.userId })
    .from(orders)
    .where(eq(orders.id, payload.orderId));
  if (order?.userId) {
    await pushInApp(ctx, {
      userId: order.userId,
      title: `Payment received for ${payload.orderNumber}`,
      body: `${formatINR(payload.amountPaise)} paid via ${payload.method}.`,
      eventName: EVENTS.paymentCaptured,
      relatedType: "order",
      relatedId: payload.orderId,
    });
  }
});

register(EVENTS.paymentFailed, async (payload, ctx) => {
  const [order] = await ctx.db
    .select({ userId: orders.userId })
    .from(orders)
    .where(eq(orders.id, payload.orderId));
  if (order?.userId) {
    await pushInApp(ctx, {
      userId: order.userId,
      title: `Payment failed for ${payload.orderNumber}`,
      body: "The payment did not go through. You can retry from your orders.",
      eventName: EVENTS.paymentFailed,
      relatedType: "order",
      relatedId: payload.orderId,
    });
  }
});

register(EVENTS.refundIssued, async (payload, ctx) => {
  if (payload.userId) {
    await pushInApp(ctx, {
      userId: payload.userId,
      title: `Refund for ${payload.orderNumber}`,
      body: `${formatINR(payload.amountPaise)} refund initiated (${payload.reason}).`,
      eventName: EVENTS.refundIssued,
      relatedType: "order",
      relatedId: payload.orderId,
    });
  }
});

register(EVENTS.stockLow, async (payload, ctx) => {
  const staff = await staffUserIds(ctx);
  for (const staffId of staff) {
    await pushInApp(ctx, {
      userId: staffId,
      title: `Low stock: ${payload.nameEn}`,
      body:
        payload.available < 1000
          ? `Only ${payload.available} g left (threshold ${payload.lowStockThreshold}).`
          : `Only ${(payload.available / 1000).toFixed(1)} kg left (threshold ${payload.lowStockThreshold / 1000} kg).`,
      eventName: EVENTS.stockLow,
      relatedType: "product",
      relatedId: payload.productId,
    });
  }
});

register(EVENTS.stockDepleted, async (payload, ctx) => {
  const staff = await staffUserIds(ctx);
  for (const staffId of staff) {
    await pushInApp(ctx, {
      userId: staffId,
      title: `Out of stock: ${payload.nameEn}`,
      body: "This product just ran out — restock or mark it out of stock.",
      eventName: EVENTS.stockDepleted,
      relatedType: "product",
      relatedId: payload.productId,
    });
  }
});

register(EVENTS.userRegistered, async (_payload, ctx) => {
  await bumpCounter(ctx, "usersRegistered");
});

/** Validate the payload and run the handler for one outbox event. */
export async function dispatchEvent(eventName: string, payload: unknown, ctx: AppContext): Promise<void> {
  const schema = EVENT_SCHEMAS[eventName as EventName];
  if (!schema) {
    childLogger({ component: "worker" }).warn({ eventName }, "unknown event; marking processed");
    return;
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    childLogger({ component: "worker" }).warn(
      { eventName, issues: parsed.error.issues },
      "invalid event payload; dead-lettering",
    );
    throw new Error(`Invalid payload for ${eventName}`);
  }
  const handler = handlers.get(eventName as EventName);
  if (!handler) return;
  await handler(parsed.data as never, ctx);
}

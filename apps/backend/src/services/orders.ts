import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Database } from "@pgrs/db";
import {
  addresses,
  cartItems,
  carts,
  couponRedemptions,
  coupons,
  deliverySlots,
  deliveryZones,
  inventory,
  orderItems,
  orderStatusHistory,
  orders,
  outboxEvents,
  payments,
  productVariants,
  products,
  refunds,
  user,
} from "@pgrs/db";
import type { OrderAddressSnapshot, OrderStatus } from "@pgrs/db";
import { EVENTS, OutboxPublisher, type EventName } from "@pgrs/events";
import { normalizePhone, type OrderDTO, type OrderItemDTO } from "@pgrs/contracts";
import type { AppContext } from "../lib/app-context";
import type { SessionUser } from "../lib/context";
import { badRequest, conflict, couponInvalid, minOrderNotMet, notFound, zoneNotServed } from "../lib/errors";
import { computeAdjustedBill, computeBill, computeLine, type PricedLine } from "./pricing";
import { validateCoupon } from "./coupons";
import { bookSlot, isValidDateString, istTodayDateString, releaseSlot } from "./slots";
import { commitSale, releaseStock, reserveStock } from "./stock";
import { createProviderOrder, createProviderRefund, mockPaymentSignature } from "./payments";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending_payment: ["confirmed", "cancelled"],
  confirmed: ["packed", "cancelled"],
  packed: ["out_for_delivery"],
  out_for_delivery: ["delivered"],
  delivered: [],
  cancelled: [],
};

export interface PlaceOrderInput {
  userId: string;
  addressId?: string;
  address?: {
    label: string;
    contactName: string;
    contactPhone: string;
    line1: string;
    line2?: string | null;
    landmark?: string | null;
    pincode: string;
    areaName?: string;
    city: string;
    isDefault: boolean;
  };
  slotId: string;
  slotDate: string;
  paymentMethod: "razorpay" | "cod";
  couponCode?: string | null;
  customerNote?: string | null;
  idempotencyKey: string;
}

export interface PlaceOrderResult {
  orderId: string;
  orderNumber: string;
  grandTotalPaise: number;
  finalGrandTotalPaise: number | null;
  status: OrderStatus;
  replay: boolean;
  payment?: {
    paymentId: string;
    providerOrderId: string;
    amountPaise: number;
    keyId: string | null;
    mock: boolean;
    /** Dev-only pre-signed pseudo payment for mock mode checkouts. */
    mockPay?: { paymentId: string; signature: string };
  };
}

function orderNumberPrefix(): string {
  return `PGRS-${istTodayDateString().replaceAll("-", "").slice(2)}-`;
}

async function nextOrderNumber(tx: Tx): Promise<string> {
  const prefix = orderNumberPrefix();
  const [row] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(orders)
    .where(sql`${orders.orderNumber} like ${`${prefix}%`}`);
  return `${prefix}${String((row?.count ?? 0) + 1).padStart(4, "0")}`;
}

export async function placeOrder(ctx: AppContext, input: PlaceOrderInput): Promise<PlaceOrderResult> {
  if (!isValidDateString(input.slotDate)) throw badRequest("Invalid slot date");

  return ctx.db.transaction(async (tx) => {
    // Idempotency: replay the original order for a repeated request.
    const [existing] = await tx.select().from(orders).where(eq(orders.idempotencyKey, input.idempotencyKey));
    if (existing) {
      const result: PlaceOrderResult = {
        orderId: existing.id,
        orderNumber: existing.orderNumber,
        grandTotalPaise: existing.grandTotalPaise,
        finalGrandTotalPaise: existing.finalGrandTotalPaise,
        status: existing.status,
        replay: true,
      };
      if (existing.paymentMethod === "razorpay") {
        const [pay] = await tx.select().from(payments).where(eq(payments.orderId, existing.id));
        if (pay?.providerOrderId) {
          result.payment = {
            paymentId: pay.id,
            providerOrderId: pay.providerOrderId,
            amountPaise: pay.amountPaise,
            keyId: ctx.env.RAZORPAY_KEY_ID || null,
            mock: pay.providerOrderId.startsWith("mock_"),
          };
        }
      }
      return result;
    }

    const [customer] = await tx.select().from(user).where(eq(user.id, input.userId));
    if (!customer) throw notFound("Customer not found");

    // ── Address + zone ────────────────────────────────────────────────────
    let snapshot: OrderAddressSnapshot;
    let zone: typeof deliveryZones.$inferSelect;
    if (input.addressId) {
      const [saved] = await tx
        .select()
        .from(addresses)
        .where(and(eq(addresses.id, input.addressId), eq(addresses.userId, input.userId)));
      if (!saved) throw notFound("Address not found");
      const [z] = await tx
        .select()
        .from(deliveryZones)
        .where(and(eq(deliveryZones.pincode, saved.pincode), eq(deliveryZones.isActive, true)));
      if (!z) throw zoneNotServed();
      zone = z;
      snapshot = {
        contactName: saved.contactName,
        contactPhone: saved.contactPhone,
        line1: saved.line1,
        line2: saved.line2,
        landmark: saved.landmark,
        pincode: saved.pincode,
        areaName: saved.areaName ?? z.areaNameEn,
        city: saved.city,
      };
    } else if (input.address) {
      const [z] = await tx
        .select()
        .from(deliveryZones)
        .where(and(eq(deliveryZones.pincode, input.address.pincode), eq(deliveryZones.isActive, true)));
      if (!z) throw zoneNotServed();
      zone = z;
      let phone: string;
      try {
        phone = normalizePhone(input.address.contactPhone);
      } catch {
        throw badRequest("Invalid contact phone number");
      }
      snapshot = {
        contactName: input.address.contactName,
        contactPhone: phone,
        line1: input.address.line1,
        line2: input.address.line2 ?? null,
        landmark: input.address.landmark ?? null,
        pincode: input.address.pincode,
        areaName: input.address.areaName ?? z.areaNameEn,
        city: input.address.city,
      };
      await tx.insert(addresses).values({
        userId: input.userId,
        label: input.address.label,
        contactName: snapshot.contactName,
        contactPhone: snapshot.contactPhone,
        line1: snapshot.line1,
        line2: snapshot.line2,
        landmark: snapshot.landmark,
        pincode: snapshot.pincode,
        areaName: snapshot.areaName,
        city: snapshot.city,
        isDefault: input.address.isDefault,
      });
    } else {
      throw badRequest("Provide addressId or a new address");
    }

    // ── Load server cart with current DB prices ───────────────────────────
    const [cart] = await tx.select().from(carts).where(eq(carts.userId, input.userId));
    if (!cart) throw badRequest("Your cart is empty");
    const rows = await tx
      .select({
        quantity: cartItems.quantity,
        product: products,
        variant: productVariants,
        imageUrl: sql<
          string | null
        >`(select pi.url from product_images pi where pi.product_id = ${products.id} order by pi.sort_order asc limit 1)`,
      })
      .from(cartItems)
      .innerJoin(productVariants, eq(cartItems.variantId, productVariants.id))
      .innerJoin(products, eq(cartItems.productId, products.id))
      .where(eq(cartItems.cartId, cart.id));
    const items = rows.filter((r) => r.product.isActive && r.variant.isActive);
    if (items.length === 0) throw badRequest("Your cart items are no longer available");

    const lines = items.map((r) => ({
      row: r,
      priced: computeLine({
        unitPricePaise: r.variant.pricePaise,
        quantity: r.quantity,
        baseQuantity: r.variant.baseQuantity,
        unitType: r.variant.unitType,
        gstRate: r.product.gstRate,
      }),
      orderedQtyGrams: r.variant.unitType === "weight" ? r.variant.baseQuantity * r.quantity : r.quantity,
    }));
    const subtotalPaise = lines.reduce((s, l) => s + l.priced.lineSubtotalPaise, 0);

    if (subtotalPaise < zone.minOrderPaise) {
      throw minOrderNotMet(zone.minOrderPaise);
    }

    // ── Coupon ────────────────────────────────────────────────────────────
    let coupon: typeof coupons.$inferSelect | null = null;
    if (input.couponCode) {
      const [c] = await tx.select().from(coupons).where(eq(coupons.code, input.couponCode.toUpperCase()));
      if (!c) throw couponInvalid("Coupon code not found");
      const [usedRow] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(couponRedemptions)
        .where(and(eq(couponRedemptions.couponId, c.id), eq(couponRedemptions.userId, input.userId)));
      const [orderCount] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(orders)
        .where(and(eq(orders.userId, input.userId), sql`${orders.status} <> 'cancelled'`));
      validateCoupon({
        coupon: c,
        subtotalPaise,
        now: new Date(),
        isActive: true,
        userRedemptionCount: usedRow?.count ?? 0,
        isFirstOrder: (orderCount?.count ?? 0) === 0,
      });
      coupon = c;
    }

    const bill = computeBill(
      lines.map((l) => ({
        unitPricePaise: l.row.variant.pricePaise,
        quantity: l.row.quantity,
        baseQuantity: l.row.variant.baseQuantity,
        unitType: l.row.variant.unitType,
        gstRate: l.row.product.gstRate,
      })),
      coupon && {
        couponType: coupon.couponType,
        value: coupon.value,
        maxDiscountPaise: coupon.maxDiscountPaise,
      },
      zone,
    );

    // ── Stock reservation + slot booking (atomic, no overselling) ─────────
    const orderId = randomUUID();
    await reserveStock(
      tx,
      lines.map((l) => ({
        productId: l.row.product.id,
        nameEn: l.row.product.nameEn,
        amount: l.orderedQtyGrams,
      })),
      orderId,
    );
    const [slot] = await tx.select().from(deliverySlots).where(eq(deliverySlots.id, input.slotId));
    if (!slot) throw notFound("Delivery slot not found");
    await bookSlot(tx, input.slotId, input.slotDate);

    // ── Persist order ─────────────────────────────────────────────────────
    const status: OrderStatus = input.paymentMethod === "cod" ? "confirmed" : "pending_payment";
    const [order] = await tx
      .insert(orders)
      .values({
        id: orderId,
        orderNumber: await nextOrderNumber(tx),
        userId: input.userId,
        status,
        paymentMethod: input.paymentMethod,
        paymentStatus: "pending",
        address: snapshot,
        pincode: snapshot.pincode,
        zoneId: zone.id,
        slotId: slot.id,
        slotDate: input.slotDate,
        slotLabelEn: slot.nameEn,
        slotLabelMl: slot.nameMl,
        subtotalPaise: bill.subtotalPaise,
        discountPaise: bill.discountPaise,
        deliveryFeePaise: bill.deliveryFeePaise,
        gstTotalPaise: bill.gstTotalPaise,
        gstBreakdown: bill.gstBreakdown,
        grandTotalPaise: bill.grandTotalPaise,
        couponId: coupon?.id ?? null,
        couponCode: coupon?.code ?? null,
        customerNote: input.customerNote ?? null,
        idempotencyKey: input.idempotencyKey,
      })
      .returning();
    if (!order) throw new Error("Order insert failed");

    await tx.insert(orderItems).values(
      lines.map((l) => ({
        orderId: order.id,
        productId: l.row.product.id,
        variantId: l.row.variant.id,
        nameEn: l.row.product.nameEn,
        nameMl: l.row.product.nameMl,
        unitLabelEn: l.row.variant.labelEn,
        unitLabelMl: l.row.variant.labelMl,
        unitType: l.row.variant.unitType,
        hsnCode: l.row.product.hsnCode,
        gstRate: l.row.product.gstRate,
        unitPricePaise: l.row.variant.pricePaise,
        quantity: l.row.quantity,
        orderedQtyGrams: l.orderedQtyGrams,
        lineSubtotalPaise: l.priced.lineSubtotalPaise,
        lineGstPaise: l.priced.lineGstPaise,
        lineTotalPaise: l.priced.lineSubtotalPaise,
      })),
    );

    if (coupon) {
      const claimed = await tx
        .update(coupons)
        .set({ usedCount: sql`${coupons.usedCount} + 1` })
        .where(
          and(
            eq(coupons.id, coupon.id),
            sql`(${coupons.usageLimit} is null or ${coupons.usedCount} < ${coupons.usageLimit})`,
          ),
        )
        .returning({ id: coupons.id });
      if (claimed.length === 0) throw couponInvalid("This coupon has just been fully redeemed");
      await tx.insert(couponRedemptions).values({
        couponId: coupon.id,
        userId: input.userId,
        orderId: order.id,
        discountPaise: bill.discountPaise,
      });
    }

    let paymentId: string | null = null;
    if (input.paymentMethod === "razorpay") {
      const [payment] = await tx
        .insert(payments)
        .values({
          orderId: order.id,
          provider: "razorpay",
          method: "upi",
          amountPaise: bill.grandTotalPaise,
          status: "created",
          idempotencyKey: `pay-${input.idempotencyKey}`,
          requestPayload: { receipt: order.orderNumber },
        })
        .returning({ id: payments.id });
      paymentId = payment?.id ?? null;
    }

    await tx.insert(orderStatusHistory).values({
      orderId: order.id,
      fromStatus: null,
      toStatus: status,
      note:
        input.paymentMethod === "cod" ? "Order placed (cash on delivery)" : "Order placed, awaiting payment",
      changedBy: input.userId,
    });

    const outbox = new OutboxPublisher(tx);
    await outbox.publish(EVENTS.orderPlaced, {
      orderId: order.id,
      orderNumber: order.orderNumber,
      userId: input.userId,
      paymentMethod: input.paymentMethod,
      grandTotalPaise: bill.grandTotalPaise,
      slotId: slot.id,
      slotDate: input.slotDate,
      pincode: snapshot.pincode,
      customerPhone: snapshot.contactPhone,
      customerName: customer.name || snapshot.contactName,
      items: lines.map((l) => ({
        productId: l.row.product.id,
        variantId: l.row.variant.id,
        nameEn: l.row.product.nameEn,
        quantity: l.row.quantity,
        orderedQtyGrams: l.orderedQtyGrams,
        unitType: l.row.variant.unitType,
      })),
    });
    if (input.paymentMethod === "cod") {
      await outbox.publish(EVENTS.orderConfirmed, {
        orderId: order.id,
        orderNumber: order.orderNumber,
        userId: input.userId,
        grandTotalPaise: bill.grandTotalPaise,
        customerPhone: snapshot.contactPhone,
        customerName: customer.name || snapshot.contactName,
        note: null,
      });
    }

    // Cart is consumed by the order.
    await tx.delete(cartItems).where(eq(cartItems.cartId, cart.id));
    if (cart.couponId) {
      await tx.update(carts).set({ couponId: null }).where(eq(carts.id, cart.id));
    }

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      grandTotalPaise: bill.grandTotalPaise,
      finalGrandTotalPaise: null,
      status,
      replay: false,
      payment: paymentId
        ? {
            paymentId,
            providerOrderId: "",
            amountPaise: bill.grandTotalPaise,
            keyId: ctx.env.RAZORPAY_KEY_ID || null,
            mock: false,
          }
        : undefined,
    };
  });
}

/**
 * Razorpay orders are created at the provider AFTER the DB transaction
 * commits; the payment row is updated with the provider order id.
 */
export async function ensureProviderOrder(
  ctx: AppContext,
  orderId: string,
): Promise<PlaceOrderResult["payment"] & { orderId: string }> {
  const [order] = await ctx.db.select().from(orders).where(eq(orders.id, orderId));
  if (!order || order.paymentMethod !== "razorpay") throw notFound("Order not payable");
  const [payment] = await ctx.db
    .select()
    .from(payments)
    .where(eq(payments.orderId, orderId))
    .orderBy(desc(payments.createdAt))
    .limit(1);
  if (!payment) throw notFound("Payment record not found");
  if (payment.status === "captured" || payment.status === "refunded") {
    throw conflict("Payment already completed");
  }

  let providerOrderId = payment.providerOrderId;
  const mock = !ctx.env.RAZORPAY_KEY_ID || !ctx.env.RAZORPAY_KEY_SECRET;
  if (!providerOrderId) {
    const providerOrder = await createProviderOrder(ctx.env, {
      amountPaise: order.grandTotalPaise,
      receipt: order.orderNumber,
      notes: { orderNumber: order.orderNumber },
    });
    providerOrderId = providerOrder.providerOrderId;
    await ctx.db
      .update(payments)
      .set({
        providerOrderId,
        status: "created",
        updatedAt: new Date(),
      })
      .where(eq(payments.id, payment.id));
  }

  // Dev mock mode: hand the browser a pre-signed pseudo-payment so the whole
  // checkout flow works without Razorpay keys. The signature is server-side.
  let mockPay: { paymentId: string; signature: string } | undefined;
  if (providerOrderId.startsWith("mock_")) {
    const mockPaymentId = `mock_pay_${randomUUID().slice(0, 12)}`;
    mockPay = {
      paymentId: mockPaymentId,
      signature: mockPaymentSignature(ctx.env, providerOrderId, mockPaymentId),
    };
  }

  return {
    orderId: order.id,
    paymentId: payment.id,
    providerOrderId,
    amountPaise: order.grandTotalPaise,
    keyId: ctx.env.RAZORPAY_KEY_ID || null,
    mock,
    mockPay,
  };
}

export interface CaptureInput {
  providerOrderId: string;
  providerPaymentId: string;
  amountPaise: number;
  method?: string;
  providerPayload?: Record<string, unknown>;
}

/** Idempotent payment capture: webhook and client-verify both funnel here. */
export async function capturePayment(
  ctx: AppContext,
  input: CaptureInput,
): Promise<{ orderId: string; alreadyCaptured: boolean }> {
  return ctx.db.transaction(async (tx) => {
    const [payment] = await tx
      .select()
      .from(payments)
      .where(eq(payments.providerOrderId, input.providerOrderId));
    if (!payment) throw notFound("Payment not found for provider order");

    const [order] = await tx.select().from(orders).where(eq(orders.id, payment.orderId));
    if (!order) throw notFound("Order not found");

    if (payment.status === "captured") {
      return { orderId: order.id, alreadyCaptured: true };
    }

    await tx
      .update(payments)
      .set({
        providerPaymentId: input.providerPaymentId,
        method: input.method ?? payment.method,
        amountPaise: input.amountPaise,
        status: "captured",
        providerPayload: input.providerPayload ?? null,
        updatedAt: new Date(),
      })
      .where(eq(payments.id, payment.id));

    const outbox = new OutboxPublisher(tx);
    await outbox.publish(EVENTS.paymentCaptured, {
      orderId: order.id,
      orderNumber: order.orderNumber,
      userId: order.userId,
      paymentId: payment.id,
      providerOrderId: input.providerOrderId,
      providerPaymentId: input.providerPaymentId,
      amountPaise: input.amountPaise,
      method: input.method ?? "upi",
    });

    if (order.status === "pending_payment") {
      await tx
        .update(orders)
        .set({ status: "confirmed", paymentStatus: "paid", updatedAt: new Date() })
        .where(eq(orders.id, order.id));
      await tx.insert(orderStatusHistory).values({
        orderId: order.id,
        fromStatus: "pending_payment",
        toStatus: "confirmed",
        note: "Payment received",
      });
      await outbox.publish(EVENTS.orderConfirmed, {
        orderId: order.id,
        orderNumber: order.orderNumber,
        userId: order.userId,
        grandTotalPaise: order.grandTotalPaise,
        customerPhone: order.address.contactPhone,
        customerName: order.userId
          ? ((await tx.select({ name: user.name }).from(user).where(eq(user.id, order.userId)))[0]?.name ??
            null)
          : null,
        note: "Payment received",
      });
    } else if (order.paymentStatus === "pending") {
      await tx
        .update(orders)
        .set({ paymentStatus: "paid", updatedAt: new Date() })
        .where(eq(orders.id, order.id));
    }

    return { orderId: order.id, alreadyCaptured: false };
  });
}

export async function markPaymentFailed(
  ctx: AppContext,
  providerOrderId: string,
  reason: string,
): Promise<void> {
  await ctx.db
    .update(payments)
    .set({ status: "failed", errorMessage: reason, updatedAt: new Date() })
    .where(eq(payments.providerOrderId, providerOrderId));
}

export interface PackOrderInput {
  orderId: string;
  weights: Array<{ itemId: string; finalQtyGrams: number }>;
  actor: SessionUser | null;
}

/** Packing with weight adjustment: recompute the bill and commit the sale. */
export async function packOrder(ctx: AppContext, input: PackOrderInput): Promise<OrderDTO> {
  const result = await ctx.db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, input.orderId));
    if (!order) throw notFound("Order not found");
    if (order.status !== "confirmed") {
      throw conflict(`Order is ${order.status}; only confirmed orders can be packed`);
    }
    if (order.paymentMethod === "cod" && order.paymentStatus !== "pending") {
      throw conflict("Unexpected payment state for a COD order");
    }

    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    const weights = new Map(input.weights.map((w) => [w.itemId, w.finalQtyGrams]));

    const saleItems: Array<{
      itemId: string;
      productId: string;
      nameEn: string;
      finalQtyGrams: number;
      reservedAmount: number;
      priced: PricedLine;
    }> = [];

    for (const item of items) {
      const isWeight = item.unitType === "weight";
      const finalQtyGrams = weights.get(item.id) ?? item.orderedQtyGrams;
      if (isWeight) {
        const min = Math.ceil(item.orderedQtyGrams * 0.25);
        const max = Math.ceil(item.orderedQtyGrams * 1.5);
        if (finalQtyGrams < min || finalQtyGrams > max) {
          throw badRequest(
            `${item.nameEn}: packed weight must be between ${min}g and ${max}g (ordered ${item.orderedQtyGrams}g)`,
          );
        }
        // Extra grams beyond the reservation must still be on the shelf.
        if (finalQtyGrams > item.orderedQtyGrams) {
          const [invRow] = await tx
            .select()
            .from(inventory)
            .where(eq(inventory.productId, item.productId ?? ""));
          const available = invRow ? invRow.stockQuantity - invRow.reservedQuantity : 0;
          if (invRow?.trackStock && finalQtyGrams - item.orderedQtyGrams > available) {
            throw badRequest(`${item.nameEn}: not enough stock for the extra weight`);
          }
        }
      }
      saleItems.push({
        itemId: item.id,
        productId: item.productId ?? "",
        nameEn: item.nameEn,
        finalQtyGrams: isWeight ? finalQtyGrams : item.quantity,
        reservedAmount: item.orderedQtyGrams,
        priced: {
          unitPricePaise: item.unitPricePaise,
          quantity: item.quantity,
          baseQuantity: isWeight ? item.orderedQtyGrams / item.quantity : 1,
          unitType: item.unitType === "weight" ? "weight" : "unit",
          gstRate: item.gstRate,
        },
      });
    }

    const finalBill = computeAdjustedBill(
      saleItems.map((s) => ({ ...s.priced, finalQtyGrams: s.finalQtyGrams })),
      order.discountPaise,
      order.deliveryFeePaise,
    );

    for (const s of saleItems) {
      const lineTotal = computeAdjustedLine(s.priced, s.finalQtyGrams);
      await tx
        .update(orderItems)
        .set({
          finalQtyGrams: s.finalQtyGrams,
          finalLineTotalPaise: lineTotal,
          weightAdjusted: s.priced.unitType === "weight" && s.finalQtyGrams !== s.reservedAmount,
        })
        .where(eq(orderItems.id, s.itemId));
    }

    await tx
      .update(orders)
      .set({
        status: "packed",
        packedAt: new Date(),
        weightAdjusted: finalBill.grandTotalPaise !== order.grandTotalPaise,
        finalSubtotalPaise: finalBill.subtotalPaise,
        finalGrandTotalPaise: finalBill.grandTotalPaise,
        gstBreakdown: finalBill.gstBreakdown,
        gstTotalPaise: finalBill.gstTotalPaise,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id));

    await tx.insert(orderStatusHistory).values({
      orderId: order.id,
      fromStatus: "confirmed",
      toStatus: "packed",
      note: `Packed; final total ₹${(finalBill.grandTotalPaise / 100).toFixed(2)}`,
      changedBy: input.actor?.id ?? null,
    });

    await commitSale(
      tx,
      saleItems.map((s) => ({
        productId: s.productId,
        nameEn: s.nameEn,
        soldAmount: s.finalQtyGrams,
        reservedAmount: s.reservedAmount,
        lowStockThreshold: 0,
      })),
      order.id,
    );

    const paidPaise = order.paymentStatus === "paid" ? order.grandTotalPaise : 0;
    const refundDuePaise = Math.max(0, paidPaise - finalBill.grandTotalPaise);
    const collectDuePaise =
      order.paymentMethod === "cod"
        ? finalBill.grandTotalPaise
        : Math.max(0, finalBill.grandTotalPaise - paidPaise);

    const outbox = new OutboxPublisher(tx);
    await outbox.publish(EVENTS.orderPacked, {
      orderId: order.id,
      orderNumber: order.orderNumber,
      userId: order.userId,
      grandTotalPaise: finalBill.grandTotalPaise,
      customerPhone: order.address.contactPhone,
      customerName: null,
      note: null,
      finalGrandTotalPaise: finalBill.grandTotalPaise,
      refundDuePaise,
      collectDuePaise,
    });

    // Prepaid orders that got cheaper are refunded automatically.
    let refundRow: typeof refunds.$inferSelect | null = null;
    if (refundDuePaise > 0) {
      const [pay] = await tx.select().from(payments).where(eq(payments.orderId, order.id));
      const [r] = await tx
        .insert(refunds)
        .values({
          orderId: order.id,
          paymentId: pay?.id ?? null,
          amountPaise: refundDuePaise,
          reason: "Weight adjustment refund (packed lighter than ordered)",
          status: "pending",
          initiatedBy: input.actor?.id ?? null,
        })
        .returning();
      refundRow = r ?? null;
      await tx.update(orders).set({ paymentStatus: "partially_refunded" }).where(eq(orders.id, order.id));
    }

    return { order, finalBill, refundRow };
  });

  // Provider refund call happens after commit; row status updated best-effort.
  if (result.refundRow) {
    await settleRefund(ctx, result.refundRow.id);
  }

  return getOrderDTO(ctx.db, input.orderId);
}

function computeAdjustedLine(priced: PricedLine, finalQtyGrams: number): number {
  if (priced.unitType !== "weight") return priced.unitPricePaise * priced.quantity;
  const perGram = priced.unitPricePaise / priced.baseQuantity;
  return Math.round(perGram * finalQtyGrams);
}

export async function cancelOrder(
  ctx: AppContext,
  input: { orderId: string; reason: string; actor: SessionUser | null; customerInitiated: boolean },
): Promise<OrderDTO> {
  const result = await ctx.db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, input.orderId));
    if (!order) throw notFound("Order not found");
    if (order.status !== "confirmed" && order.status !== "pending_payment") {
      throw conflict("Orders can only be cancelled before packing");
    }

    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    await releaseStock(
      tx,
      items.map((i) => ({
        productId: i.productId ?? "",
        nameEn: i.nameEn,
        amount: i.orderedQtyGrams,
      })),
      order.id,
    );
    if (order.slotId) {
      await releaseSlot(tx, order.slotId, order.slotDate);
    }

    await tx
      .update(orders)
      .set({
        status: "cancelled",
        cancelledAt: new Date(),
        cancellationReason: input.reason,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id));
    await tx.insert(orderStatusHistory).values({
      orderId: order.id,
      fromStatus: order.status,
      toStatus: "cancelled",
      note: input.reason,
      changedBy: input.actor?.id ?? null,
    });

    const outbox = new OutboxPublisher(tx);
    await outbox.publish(EVENTS.orderCancelled, {
      orderId: order.id,
      orderNumber: order.orderNumber,
      userId: order.userId,
      grandTotalPaise: order.grandTotalPaise,
      customerPhone: order.address.contactPhone,
      customerName: null,
      note: input.reason,
    });

    let refundRow: typeof refunds.$inferSelect | null = null;
    if (order.paymentStatus === "paid" && order.grandTotalPaise > 0) {
      const [pay] = await tx.select().from(payments).where(eq(payments.orderId, order.id));
      const [r] = await tx
        .insert(refunds)
        .values({
          orderId: order.id,
          paymentId: pay?.id ?? null,
          amountPaise: order.grandTotalPaise,
          reason: `Cancellation refund: ${input.reason}`,
          status: "pending",
          initiatedBy: input.actor?.id ?? null,
        })
        .returning();
      refundRow = r ?? null;
      await tx.update(orders).set({ paymentStatus: "refunded" }).where(eq(orders.id, order.id));
    }
    return refundRow;
  });

  if (result) await settleRefund(ctx, result.id);
  return getOrderDTO(ctx.db, input.orderId);
}

/** Call the provider for a pending refund and record the outcome. */
export async function settleRefund(ctx: AppContext, refundId: string): Promise<void> {
  const [refund] = await ctx.db.select().from(refunds).where(eq(refunds.id, refundId));
  if (!refund || refund.status !== "pending") return;
  const [pay] = refund.paymentId
    ? await ctx.db.select().from(payments).where(eq(payments.id, refund.paymentId))
    : [];
  try {
    const provider = await createProviderRefund(
      ctx.env,
      pay?.providerPaymentId ?? "mock_pay",
      refund.amountPaise,
    );
    await ctx.db
      .update(refunds)
      .set({
        status: "processed",
        providerRefundId: provider.providerRefundId,
        providerPayload: { mock: provider.mock },
        updatedAt: new Date(),
      })
      .where(eq(refunds.id, refundId));
  } catch (err) {
    await ctx.db
      .update(refunds)
      .set({
        status: "failed",
        reason: `${refund.reason} (provider error: ${String(err).slice(0, 120)})`,
        updatedAt: new Date(),
      })
      .where(eq(refunds.id, refundId));
    return;
  }
  const [order] = await ctx.db.select().from(orders).where(eq(orders.id, refund.orderId));
  if (order) {
    const issued = order.refundIssuedPaise + refund.amountPaise;
    await ctx.db
      .update(orders)
      .set({
        refundIssuedPaise: issued,
        paymentStatus: issued >= order.grandTotalPaise ? "refunded" : "partially_refunded",
      })
      .where(eq(orders.id, order.id));
    const outboxRow = await ctx.db
      .insert(outboxEvents)
      .values({
        eventName: EVENTS.refundIssued,
        payload: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          userId: order.userId,
          refundId: refund.id,
          amountPaise: refund.amountPaise,
          reason: refund.reason,
          paymentMethod: order.paymentMethod,
        },
      })
      .returning({ id: outboxEvents.id });
    void outboxRow;
  }
}

/** Generic status transition used by the admin board and delivery flow. */
export async function transitionOrder(
  ctx: AppContext,
  input: { orderId: string; to: OrderStatus; note?: string | null; actor: SessionUser | null },
): Promise<OrderDTO> {
  await ctx.db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, input.orderId));
    if (!order) throw notFound("Order not found");
    const allowed = ALLOWED_TRANSITIONS[order.status] ?? [];
    if (!allowed.includes(input.to)) {
      throw conflict(`Cannot move order from ${order.status} to ${input.to}`);
    }
    const now = new Date();
    const patch: Partial<typeof orders.$inferInsert> = { status: input.to, updatedAt: now };
    if (input.to === "out_for_delivery") patch.outForDeliveryAt = now;
    if (input.to === "delivered") patch.deliveredAt = now;
    await tx.update(orders).set(patch).where(eq(orders.id, order.id));
    await tx.insert(orderStatusHistory).values({
      orderId: order.id,
      fromStatus: order.status,
      toStatus: input.to,
      note: input.note ?? null,
      changedBy: input.actor?.id ?? null,
    });

    const eventByStatus: Partial<Record<OrderStatus, EventName>> = {
      out_for_delivery: EVENTS.orderOutForDelivery,
      delivered: EVENTS.orderDelivered,
      confirmed: EVENTS.orderConfirmed,
    };
    const eventName = eventByStatus[input.to];
    if (eventName) {
      const outbox = new OutboxPublisher(tx);
      await outbox.publish(eventName, {
        orderId: order.id,
        orderNumber: order.orderNumber,
        userId: order.userId,
        grandTotalPaise: order.finalGrandTotalPaise ?? order.grandTotalPaise,
        customerPhone: order.address.contactPhone,
        customerName: null,
        note: input.note ?? null,
      });
    }
  });
  return getOrderDTO(ctx.db, input.orderId);
}

// ── DTO assembly ─────────────────────────────────────────────────────────────

export async function getOrderDTO(db: Database, orderId: string): Promise<OrderDTO> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!order) throw notFound("Order not found");

  const items = await db
    .select({
      item: orderItems,
      slug: products.slug,
      imageUrl: sql<
        string | null
      >`(select pi.url from product_images pi where pi.product_id = ${orderItems.productId} order by pi.sort_order asc limit 1)`,
    })
    .from(orderItems)
    .leftJoin(products, eq(orderItems.productId, products.id))
    .where(eq(orderItems.orderId, orderId));

  const history = await db
    .select()
    .from(orderStatusHistory)
    .where(eq(orderStatusHistory.orderId, orderId))
    .orderBy(orderStatusHistory.createdAt);

  const paymentRows = await db.select().from(payments).where(eq(payments.orderId, orderId));
  const refundRows = await db.select().from(refunds).where(eq(refunds.orderId, orderId));
  const assignee = order.assignedTo
    ? (await db.select({ name: user.name }).from(user).where(eq(user.id, order.assignedTo)))[0]
    : null;

  const itemDTOs: OrderItemDTO[] = items.map(({ item, slug, imageUrl }) => ({
    id: item.id,
    productId: item.productId,
    variantId: item.variantId,
    productSlug: slug ?? null,
    nameEn: item.nameEn,
    nameMl: item.nameMl,
    unitLabelEn: item.unitLabelEn,
    unitLabelMl: item.unitLabelMl,
    unitType: item.unitType,
    hsnCode: item.hsnCode,
    gstRate: item.gstRate,
    unitPricePaise: item.unitPricePaise,
    quantity: item.quantity,
    orderedQtyGrams: item.orderedQtyGrams,
    finalQtyGrams: item.finalQtyGrams,
    lineSubtotalPaise: item.lineSubtotalPaise,
    lineGstPaise: item.lineGstPaise,
    lineTotalPaise: item.lineTotalPaise,
    finalLineTotalPaise: item.finalLineTotalPaise,
    weightAdjusted: item.weightAdjusted,
    imageUrl: imageUrl ?? null,
  }));

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    source: order.source,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    address: order.address,
    slotDate: order.slotDate,
    slotLabelEn: order.slotLabelEn,
    slotLabelMl: order.slotLabelMl,
    subtotalPaise: order.subtotalPaise,
    discountPaise: order.discountPaise,
    deliveryFeePaise: order.deliveryFeePaise,
    gstTotalPaise: order.gstTotalPaise,
    gstBreakdown: order.gstBreakdown,
    grandTotalPaise: order.grandTotalPaise,
    finalSubtotalPaise: order.finalSubtotalPaise,
    finalGrandTotalPaise: order.finalGrandTotalPaise,
    weightAdjusted: order.weightAdjusted,
    refundIssuedPaise: order.refundIssuedPaise,
    codCollectedPaise: order.codCollectedPaise,
    couponCode: order.couponCode,
    customerNote: order.customerNote,
    placedAt: order.placedAt.toISOString(),
    packedAt: order.packedAt?.toISOString() ?? null,
    outForDeliveryAt: order.outForDeliveryAt?.toISOString() ?? null,
    deliveredAt: order.deliveredAt?.toISOString() ?? null,
    cancelledAt: order.cancelledAt?.toISOString() ?? null,
    cancellationReason: order.cancellationReason,
    items: itemDTOs,
    history: history.map((h) => ({
      id: h.id,
      fromStatus: h.fromStatus,
      toStatus: h.toStatus,
      note: h.note,
      createdAt: h.createdAt.toISOString(),
    })),
    payments: paymentRows.map((p) => ({
      id: p.id,
      provider: p.provider,
      method: p.method,
      amountPaise: p.amountPaise,
      status: p.status,
      providerOrderId: p.providerOrderId,
      providerPaymentId: p.providerPaymentId,
      createdAt: p.createdAt.toISOString(),
    })),
    refunds: refundRows.map((r) => ({
      id: r.id,
      amountPaise: r.amountPaise,
      reason: r.reason,
      status: r.status,
      providerRefundId: r.providerRefundId,
      createdAt: r.createdAt.toISOString(),
    })),
    assignedToId: order.assignedTo,
    assignedToName: assignee?.name ?? null,
  };
}

export interface OrderSummary {
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
  slotLabelMl: string;
  placedAt: string;
  firstItemImageUrl: string | null;
}

export interface OrderListFilters {
  userId?: string;
  statuses?: OrderStatus[];
  date?: string;
  slotId?: string;
  pincode?: string;
  q?: string;
  source?: "web" | "whatsapp";
  page: number;
  pageSize: number;
}

/** Lightweight order list for history/boards (single query + item counts). */
export async function listOrderSummaries(
  db: Database,
  filters: OrderListFilters,
): Promise<{ items: OrderSummary[]; total: number }> {
  const conditions = [];
  if (filters.userId) conditions.push(eq(orders.userId, filters.userId));
  if (filters.statuses && filters.statuses.length > 0) {
    conditions.push(inArray(orders.status, filters.statuses));
  }
  if (filters.date) conditions.push(eq(orders.slotDate, filters.date));
  if (filters.slotId) conditions.push(eq(orders.slotId, filters.slotId));
  if (filters.pincode) conditions.push(eq(orders.pincode, filters.pincode));
  if (filters.source) conditions.push(eq(orders.source, filters.source));
  if (filters.q) {
    const like = `%${filters.q}%`;
    conditions.push(
      sql`(${orders.orderNumber} like ${like} or ${orders.address} ->> 'contactName' like ${like} or ${orders.address} ->> 'contactPhone' like ${like})`,
    );
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(orders)
    .where(where);
  const rows = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
      source: orders.source,
      paymentMethod: orders.paymentMethod,
      paymentStatus: orders.paymentStatus,
      grandTotalPaise: orders.grandTotalPaise,
      finalGrandTotalPaise: orders.finalGrandTotalPaise,
      slotDate: orders.slotDate,
      slotLabelEn: orders.slotLabelEn,
      slotLabelMl: orders.slotLabelMl,
      placedAt: orders.placedAt,
      itemCount: sql<number>`(select count(*)::int from order_items oi where oi.order_id = "orders"."id")`,
      firstItemImageUrl: sql<
        string | null
      >`(select pi.url from order_items oi join product_images pi on pi.product_id = oi.product_id where oi.order_id = "orders"."id" order by oi.id limit 1)`,
    })
    .from(orders)
    .where(where)
    .orderBy(desc(orders.createdAt))
    .limit(filters.pageSize)
    .offset((filters.page - 1) * filters.pageSize);

  return {
    items: rows.map((r) => ({
      ...r,
      placedAt: r.placedAt.toISOString(),
    })),
    total: countRow?.count ?? 0,
  };
}

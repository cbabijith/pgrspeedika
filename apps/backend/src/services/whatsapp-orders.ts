import { and, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { formatINR, normalizePhone } from "@pgrs/contracts";
import type { WhatsAppOrderRequest, WhatsAppOrderResult } from "@pgrs/contracts";
import {
  addresses,
  deliveryZones,
  orders,
  outboxEvents,
  productVariants,
  products,
  schema,
  user,
  type OrderAddressSnapshot,
} from "@pgrs/db";
import type { Database } from "@pgrs/db";
import { EVENTS } from "@pgrs/events";
import { badRequest, minOrderNotMet, zoneNotServed } from "../lib/errors";
import { computeBill, computeLine } from "./pricing";
import { bookSlot, slotAvailabilityForDate, istTodayDateString } from "./slots";
import { reserveStock } from "./stock";

interface LoadedLine {
  productId: string;
  variantId: string;
  nameEn: string;
  nameMl: string;
  unitLabelEn: string;
  unitLabelMl: string;
  pricePaise: number;
  quantity: number;
  orderedQtyGrams: number;
  gstRate: number;
  lineSubtotalPaise: number;
  lineGstPaise: number;
}

/** Find the customer by phone, creating a lightweight account on first order. */
export async function findOrCreateCustomerByPhone(
  db: Database,
  input: { name: string; phone: string },
): Promise<{ userId: string; isNew: boolean }> {
  const [existing] = await db.select().from(user).where(eq(user.phoneNumber, input.phone));
  if (existing) return { userId: existing.id, isNew: false };
  const [created] = await db
    .insert(user)
    .values({
      id: randomUUID(),
      name: input.name,
      email: "",
      phoneNumber: input.phone,
      phoneNumberVerified: true,
      role: "customer",
    })
    .returning({ id: user.id });
  if (!created) throw new Error("Could not create customer");
  await db.insert(outboxEvents).values({
    eventName: EVENTS.userRegistered,
    payload: { userId: created.id, name: input.name, phone: input.phone, email: null, role: "customer" },
  });
  return { userId: created.id, isNew: true };
}

/** Saved name + addresses for a phone — used to prefill repeat WhatsApp orders. */
export async function lookupCustomerByPhone(
  db: Database,
  phone: string,
): Promise<{
  name: string;
  addresses: Array<{ line1: string; landmark: string | null; pincode: string; city: string }>;
} | null> {
  const [existing] = await db.select().from(user).where(eq(user.phoneNumber, phone));
  if (!existing) return null;
  const rows = await db.select().from(addresses).where(eq(addresses.userId, existing.id));
  return {
    name: existing.name,
    addresses: rows.map((a) => ({ line1: a.line1, landmark: a.landmark, pincode: a.pincode, city: a.city })),
  };
}

/** Next bookable slot across today and tomorrow (WhatsApp orders auto-slot). */
export async function nextBookableSlot(
  db: Database,
): Promise<{ slotId: string; date: string; labelEn: string } | null> {
  const today = istTodayDateString();
  const tomorrow = istTodayDateString(new Date(Date.now() + 86_400_000));
  for (const date of [today, tomorrow]) {
    const availability = await slotAvailabilityForDate(db, date);
    const first = availability.find((a) => a.bookable);
    if (first) return { slotId: first.id, date: first.date, labelEn: first.nameEn };
  }
  return null;
}

/** Load variant/product rows for the requested items and price every line. */
async function loadLines(
  db: Database,
  items: Array<{ variantId: string; quantity: number }>,
): Promise<LoadedLine[]> {
  const rows = await db
    .select({
      variant: productVariants,
      product: products,
    })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(
      inArray(
        productVariants.id,
        items.map((i) => i.variantId),
      ),
    );
  const lines: LoadedLine[] = [];
  for (const item of items) {
    const row = rows.find((r) => r.variant.id === item.variantId);
    if (!row || !row.variant.isActive || !row.product.isActive) {
      throw badRequest("Some items are no longer available");
    }
    const priced = computeLine({
      unitPricePaise: row.variant.pricePaise,
      quantity: item.quantity,
      baseQuantity: row.variant.baseQuantity,
      unitType: row.variant.unitType,
      gstRate: row.product.gstRate,
    });
    lines.push({
      productId: row.product.id,
      variantId: row.variant.id,
      nameEn: row.product.nameEn,
      nameMl: row.product.nameMl,
      unitLabelEn: row.variant.labelEn,
      unitLabelMl: row.variant.labelMl,
      pricePaise: row.variant.pricePaise,
      quantity: item.quantity,
      orderedQtyGrams:
        row.variant.unitType === "weight" ? row.variant.baseQuantity * item.quantity : item.quantity,
      gstRate: row.product.gstRate,
      lineSubtotalPaise: priced.lineSubtotalPaise,
      lineGstPaise: priced.lineGstPaise,
    });
  }
  return lines;
}

async function nextOrderNumber(db: Database): Promise<string> {
  const prefix = `PGRS-${istTodayDateString().replaceAll("-", "").slice(2)}-`;
  const rows = await db
    .select({ orderNumber: orders.orderNumber })
    .from(orders)
    .where(sqlLikePrefix(orders.orderNumber, prefix));
  const max = rows.reduce((m, r) => {
    const n = Number(r.orderNumber.slice(prefix.length));
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

import { sql } from "drizzle-orm";
function sqlLikePrefix(column: typeof orders.orderNumber, prefix: string) {
  return sql`${column} like ${`${prefix}%`}`;
}

/** Human-readable order message shared by the shop notification and wa.me link. */
export function buildWhatsAppOrderMessage(input: {
  orderNumber: string;
  customer: { name: string; phone: string };
  address: OrderAddressSnapshot;
  slotLabel: string;
  slotDate: string;
  items: Array<{
    nameEn: string;
    nameMl: string;
    quantity: number;
    unitLabelEn: string;
    orderedQtyGrams: number;
    lineTotalPaise: number;
  }>;
  subtotalPaise: number;
  deliveryFeePaise: number;
  totalPaise: number;
  note?: string | null;
}): string {
  const lines: string[] = [];
  lines.push(`🥬 *New order ${input.orderNumber}* (via WhatsApp)`);
  lines.push(`👤 ${input.customer.name} — ${input.customer.phone}`);
  lines.push(`🏠 ${input.address.line1}${input.address.landmark ? `, ${input.address.landmark}` : ""}`);
  lines.push(`   ${input.address.areaName}, ${input.address.city} — ${input.address.pincode}`);
  lines.push(`🚚 ${input.slotLabel} · ${input.slotDate}`);
  lines.push("");
  lines.push("*Items*");
  for (const item of input.items) {
    const weight =
      item.orderedQtyGrams >= 1000
        ? `${(item.orderedQtyGrams / 1000).toString().replace(/\.0$/, "")} kg`
        : `${item.orderedQtyGrams} g`;
    lines.push(
      `• ${item.nameEn} (${item.nameMl}) — ${item.quantity} × ${item.unitLabelEn} = ${weight} — ${formatINR(item.lineTotalPaise)}`,
    );
  }
  lines.push("");
  lines.push(`Subtotal: ${formatINR(input.subtotalPaise)}`);
  lines.push(`Delivery: ${input.deliveryFeePaise === 0 ? "FREE" : formatINR(input.deliveryFeePaise)}`);
  lines.push(`*Total: ${formatINR(input.totalPaise)} — Cash on delivery*`);
  if (input.note) lines.push(`📝 Note: ${input.note}`);
  lines.push("");
  lines.push("Reply ✅ to confirm.");
  return lines.join("\n");
}

export function waMeLink(shopPhone: string, message: string): string {
  const digits = shopPhone.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

/**
 * Place a guest order from the WhatsApp lane: prices server-side, validates
 * the zone, auto-picks the next bookable slot, reserves stock, saves the
 * address against the auto-created customer, and returns the wa.me link.
 */
export interface WhatsAppOrderContext {
  db: Database;
  shopWhatsApp: () => Promise<string>;
}

export async function placeWhatsAppOrder(
  ctx: WhatsAppOrderContext,
  input: WhatsAppOrderRequest,
): Promise<WhatsAppOrderResult> {
  const db = ctx.db;
  const phone = normalizePhone(input.customer.phone);

  const [zone] = await db
    .select()
    .from(deliveryZones)
    .where(and(eq(deliveryZones.pincode, input.customer.pincode), eq(deliveryZones.isActive, true)));
  if (!zone) throw zoneNotServed();

  const lines = await loadLines(db, input.items);
  const subtotal = lines.reduce((s, l) => s + l.lineSubtotalPaise, 0);
  if (subtotal < zone.minOrderPaise) throw minOrderNotMet(zone.minOrderPaise);

  const bill = computeBill(
    lines.map((l) => ({
      unitPricePaise: l.pricePaise,
      quantity: l.quantity,
      baseQuantity: l.orderedQtyGrams / l.quantity,
      unitType: "weight" as const,
      gstRate: l.gstRate,
    })),
    null,
    zone,
  );

  // Resolve the slot: an explicit slotId is matched to its bookable date
  // (today or tomorrow); otherwise the next bookable slot is auto-picked.
  let slot: { slotId: string; date: string; labelEn: string } | null = null;
  if (input.slotId) {
    const today = istTodayDateString();
    const tomorrow = istTodayDateString(new Date(Date.now() + 86_400_000));
    for (const date of [today, tomorrow]) {
      const availability = await slotAvailabilityForDate(db, date);
      const found = availability.find((a) => a.id === input.slotId && a.bookable);
      if (found) {
        slot = { slotId: found.id, date: found.date, labelEn: found.nameEn };
        break;
      }
    }
    if (!slot) throw badRequest("This delivery slot is not available");
  } else {
    slot = await nextBookableSlot(db);
  }
  if (!slot) throw badRequest("No delivery slot is available right now");

  const customer = await findOrCreateCustomerByPhone(db, { name: input.customer.name, phone });
  const addressSnapshot: OrderAddressSnapshot = {
    contactName: input.customer.name,
    contactPhone: phone,
    line1: input.customer.line1,
    line2: null,
    landmark: input.customer.landmark ?? null,
    pincode: input.customer.pincode,
    areaName: zone.areaNameEn,
    city: input.customer.city,
  };

  const result = await db.transaction(async (tx) => {
    await reserveStock(
      tx,
      lines.map((l) => ({ productId: l.productId, nameEn: l.nameEn, amount: l.orderedQtyGrams })),
      "pending",
    );
    await bookSlot(tx, slot.slotId, slot.date);

    const orderId = randomUUID();
    const [order] = await tx
      .insert(orders)
      .values({
        id: orderId,
        orderNumber: await nextOrderNumber(db),
        userId: customer.userId,
        status: "confirmed",
        source: "whatsapp",
        paymentMethod: "cod",
        paymentStatus: "pending",
        address: addressSnapshot,
        pincode: addressSnapshot.pincode,
        zoneId: zone.id,
        slotId: slot.slotId,
        slotDate: slot.date,
        slotLabelEn: slot.labelEn,
        slotLabelMl: "",
        subtotalPaise: bill.subtotalPaise,
        discountPaise: 0,
        deliveryFeePaise: bill.deliveryFeePaise,
        gstTotalPaise: bill.gstTotalPaise,
        gstBreakdown: bill.gstBreakdown,
        grandTotalPaise: bill.grandTotalPaise,
        customerNote: input.note ?? null,
        idempotencyKey: input.idempotencyKey ?? `wa-${phone.slice(-10)}-${Date.now().toString(36)}`,
      })
      .returning();
    if (!order) throw new Error("Order insert failed");

    await tx.insert(schema.orderItems).values(
      lines.map((l) => ({
        orderId: order.id,
        productId: l.productId,
        variantId: l.variantId,
        nameEn: l.nameEn,
        nameMl: l.nameMl,
        unitLabelEn: l.unitLabelEn,
        unitLabelMl: l.unitLabelMl,
        unitType: "weight",
        hsnCode: "",
        gstRate: l.gstRate,
        unitPricePaise: l.pricePaise,
        quantity: l.quantity,
        orderedQtyGrams: l.orderedQtyGrams,
        lineSubtotalPaise: l.lineSubtotalPaise,
        lineGstPaise: l.lineGstPaise,
        lineTotalPaise: l.lineSubtotalPaise,
      })),
    );

    await tx.insert(schema.orderStatusHistory).values({
      orderId: order.id,
      fromStatus: null,
      toStatus: "confirmed",
      note: "WhatsApp order (guest)",
    });

    await tx.insert(outboxEvents).values({
      eventName: EVENTS.orderPlaced,
      payload: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        userId: customer.userId,
        paymentMethod: "cod",
        grandTotalPaise: bill.grandTotalPaise,
        slotId: slot.slotId,
        slotDate: slot.date,
        pincode: addressSnapshot.pincode,
        customerPhone: phone,
        customerName: input.customer.name,
        items: lines.map((l) => ({
          productId: l.productId,
          variantId: l.variantId,
          nameEn: l.nameEn,
          quantity: l.quantity,
          orderedQtyGrams: l.orderedQtyGrams,
          unitType: "weight",
        })),
      },
    });

    // Save the address against the phone-keyed customer (repeat orders reuse it).
    const saved = await tx.select().from(addresses).where(eq(addresses.userId, customer.userId));
    await tx.insert(addresses).values({
      userId: customer.userId,
      label: saved.length === 0 ? "Home" : "WhatsApp",
      contactName: addressSnapshot.contactName,
      contactPhone: phone,
      line1: addressSnapshot.line1,
      landmark: addressSnapshot.landmark,
      pincode: addressSnapshot.pincode,
      areaName: zone.areaNameEn,
      city: addressSnapshot.city,
      isDefault: saved.length === 0,
    });

    return order;
  });

  const shopPhone = await ctx.shopWhatsApp();
  const message = buildWhatsAppOrderMessage({
    orderNumber: result.orderNumber,
    customer: { name: input.customer.name, phone },
    address: addressSnapshot,
    slotLabel: slot.labelEn || "Next available slot",
    slotDate: slot.date,
    items: lines.map((l) => ({
      nameEn: l.nameEn,
      nameMl: l.nameMl,
      quantity: l.quantity,
      unitLabelEn: l.unitLabelEn,
      orderedQtyGrams: l.orderedQtyGrams,
      lineTotalPaise: l.lineSubtotalPaise,
    })),
    subtotalPaise: bill.subtotalPaise,
    deliveryFeePaise: bill.deliveryFeePaise,
    totalPaise: bill.grandTotalPaise,
    note: input.note ?? null,
  });

  return {
    orderId: result.id,
    orderNumber: result.orderNumber,
    grandTotalPaise: bill.grandTotalPaise,
    subtotalPaise: bill.subtotalPaise,
    deliveryFeePaise: bill.deliveryFeePaise,
    slotLabelEn: slot.labelEn || "Next available slot",
    slotDate: slot.date,
    whatsappLink: waMeLink(shopPhone, message),
    shopWhatsApp: shopPhone,
    savedAddress: true,
    isNewCustomer: customer.isNew,
    items: lines.map((l) => ({
      nameEn: l.nameEn,
      nameMl: l.nameMl,
      quantity: l.quantity,
      unitLabelEn: l.unitLabelEn,
      lineTotalPaise: l.lineSubtotalPaise,
    })),
  };
}

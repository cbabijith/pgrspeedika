import { servedZoneCondition } from "./delivery-area";
import { and, eq, inArray, sql } from "drizzle-orm";
import { createHmac, randomUUID } from "node:crypto";
import { formatINR, normalizePhone, whatsappOrderSchema, KOTTAYAM_PINCODES } from "@pgrs/contracts";
import type { WhatsAppOrderRequest, WhatsAppOrderResult } from "@pgrs/contracts";
import {
  categories,
  deliverySlots,
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
import { badRequest, conflict, minOrderNotMet, zoneNotServed } from "../lib/errors";
import { computeBill, computeLine } from "./pricing";
import { bookSlot, slotAvailabilityForDate, istTodayDateString } from "./slots";
import { reserveStock } from "./stock";
import { nextOrderNumber } from "./orders";

interface LoadedLine {
  productId: string;
  variantId: string;
  nameEn: string;
  nameMl: string;
  unitLabelEn: string;
  unitLabelMl: string;
  pricePaise: number;
  unitType: "weight" | "unit";
  hsnCode: string;
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
      phoneNumberVerified: false,
      role: "customer",
    })
    .onConflictDoNothing()
    .returning({ id: user.id });
  if (!created) {
    const [customer] = await db.select().from(user).where(eq(user.phoneNumber, input.phone));
    if (!customer) throw new Error("Could not create customer");
    return { userId: customer.id, isNew: false };
  }
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
  db: Database | Parameters<Parameters<Database["transaction"]>[0]>[0],
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
  db: Database | Parameters<Parameters<Database["transaction"]>[0]>[0],
  items: Array<{ variantId: string; quantity: number }>,
): Promise<LoadedLine[]> {
  const rows = await db
    .select({
      variant: productVariants,
      product: products,
    })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .where(
      and(
        eq(categories.isActive, true),
        inArray(
          productVariants.id,
          items.map((i) => i.variantId),
        ),
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
      unitType: row.product.sellingType === "packaged" ? "unit" : row.variant.unitType,
      hsnCode: row.product.hsnCode,
      quantity: item.quantity,
      orderedQtyGrams:
        row.product.sellingType === "loose" && row.variant.unitType === "weight"
          ? row.variant.baseQuantity * item.quantity
          : item.quantity,
      gstRate: row.product.gstRate,
      lineSubtotalPaise: priced.lineSubtotalPaise,
      lineGstPaise: priced.lineGstPaise,
    });
  }
  return lines;
}

/** Human-readable order message shared by the shop notification and wa.me link. */
export function buildWhatsAppOrderMessage(input: {
  awaitingConfirmation?: boolean;
  orderNumber: string;
  source?: string;
  paymentMethod?: string;
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
    unitType?: string;
    lineTotalPaise: number;
  }>;
  subtotalPaise: number;
  deliveryFeePaise: number;
  totalPaise: number;
  note?: string | null;
}): string {
  const lines: string[] = [];
  lines.push(`🥬 *New order ${input.orderNumber}* (via ${input.source === "web" ? "website" : "WhatsApp"})`);
  lines.push(`👤 ${input.customer.name} — ${input.customer.phone}`);
  lines.push(`🏠 ${input.address.line1}${input.address.landmark ? `, ${input.address.landmark}` : ""}`);
  lines.push(`   ${input.address.areaName}, ${input.address.city} — ${input.address.pincode}`);
  lines.push(
    input.awaitingConfirmation
      ? "🚚 Delivery charge and timing: please confirm"
      : `🚚 ${input.slotLabel} · ${input.slotDate}`,
  );
  lines.push("");
  lines.push("*Items*");
  for (const item of input.items) {
    const weight =
      item.unitType === "unit"
        ? `${item.quantity} pack(s)`
        : item.orderedQtyGrams >= 1000
          ? `${(item.orderedQtyGrams / 1000).toString().replace(/\.0$/, "")} kg`
          : `${item.orderedQtyGrams} g`;
    lines.push(
      `• ${item.nameEn} (${item.nameMl}) — ${item.quantity} × ${item.unitLabelEn} = ${weight} — ${formatINR(item.lineTotalPaise)}`,
    );
  }
  lines.push("");
  lines.push(`Subtotal: ${formatINR(input.subtotalPaise)}`);
  lines.push(
    `Delivery: ${input.awaitingConfirmation ? "To be confirmed by the shop" : input.deliveryFeePaise === 0 ? "FREE" : formatINR(input.deliveryFeePaise)}`,
  );
  lines.push(
    `*${input.awaitingConfirmation ? "Items total" : "Total"}: ${formatINR(input.totalPaise)} — ${input.paymentMethod === "razorpay" ? "Online payment" : "Cash on delivery"}*`,
  );
  if (input.note) lines.push(`📝 Note: ${input.note}`);
  lines.push("");
  lines.push("Reply ✅ to confirm.");
  return lines.join("\n");
}

export function waMeLink(shopPhone: string, message: string): string {
  const digits = normalizePhone(shopPhone).replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

/** Guest order access is tied to an unguessable checkout key, not a claimed phone. */
export function guestOrderToken(secret: string, orderId: string, key: string): string {
  return createHmac("sha256", secret).update(`guest:${orderId}:${key}`).digest("hex");
}

export interface WhatsAppOrderContext {
  requestConfirmation?: boolean;
  db: Database;
  shopWhatsApp: () => Promise<string>;
  guestTokenSecret: string;
  source?: "web" | "whatsapp";
}

/** Guest orders do not claim or modify an account based on an unverified phone. */
export async function placeWhatsAppOrder(
  ctx: WhatsAppOrderContext,
  input: WhatsAppOrderRequest,
): Promise<WhatsAppOrderResult> {
  input = whatsappOrderSchema.parse(input);
  const requestConfirmation = ctx.requestConfirmation ?? false;
  if (requestConfirmation && !(KOTTAYAM_PINCODES as readonly string[]).includes(input.customer.pincode)) {
    throw badRequest("We currently accept orders only within Kottayam district");
  }
  const phone = normalizePhone(input.customer.phone);
  const source = ctx.source ?? "whatsapp";
  // Resolve configuration before any writes; a missing number must not leave an order behind.
  let shopPhone = await ctx.shopWhatsApp();
  try {
    shopPhone = shopPhone ? normalizePhone(shopPhone) : "";
    if (source === "whatsapp" && !shopPhone) throw new Error("Missing WhatsApp number");
  } catch {
    if (source === "whatsapp") throw badRequest("Configure a valid shop WhatsApp number in Settings");
    shopPhone = "";
  }
  const key = input.idempotencyKey ?? `guest-${randomUUID()}`;
  const outcome = await ctx.db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);
    const [existing] = await tx.select().from(orders).where(eq(orders.idempotencyKey, key));
    if (existing) {
      if (existing.userId || existing.address.contactPhone !== phone || existing.source !== source) {
        throw conflict("This checkout key is already in use");
      }
      const lines = await tx
        .select()
        .from(schema.orderItems)
        .where(eq(schema.orderItems.orderId, existing.id));
      return { order: existing, lines, replay: true };
    }
    const [zone] = await tx.select().from(deliveryZones).where(servedZoneCondition(input.customer.pincode));
    if (!zone && !requestConfirmation) throw zoneNotServed();
    const lines = await loadLines(tx, input.items);
    if (
      !requestConfirmation &&
      zone &&
      lines.reduce((n, l) => n + l.lineSubtotalPaise, 0) < zone.minOrderPaise
    )
      throw minOrderNotMet(zone.minOrderPaise);
    const bill = computeBill(
      lines.map((l) => ({
        unitPricePaise: l.pricePaise,
        quantity: l.quantity,
        baseQuantity: l.orderedQtyGrams / l.quantity,
        unitType: l.unitType,
        gstRate: l.gstRate,
      })),
      null,
      requestConfirmation ? null : (zone ?? null),
    );
    let slot = requestConfirmation
      ? { slotId: null, date: istTodayDateString(), labelEn: "Timing to be confirmed on WhatsApp" }
      : await nextBookableSlot(tx);
    if (!requestConfirmation && input.slotId) {
      const date = input.slotDate ?? slot?.date;
      if (!date) throw badRequest("Select a delivery date");
      const [selected] = await tx.select().from(deliverySlots).where(eq(deliverySlots.id, input.slotId));
      if (!selected) throw badRequest("Delivery slot not found");
      slot = { slotId: selected.id, date, labelEn: selected.nameEn };
    }
    if (!slot) throw badRequest("No delivery slot is available right now");
    const orderId = randomUUID();
    if (!requestConfirmation)
      await reserveStock(
        tx,
        lines.map((l) => ({ productId: l.productId, nameEn: l.nameEn, amount: l.orderedQtyGrams })),
        orderId,
      );
    if (slot.slotId) await bookSlot(tx, slot.slotId, slot.date);
    const slotRow = slot.slotId
      ? (await tx.select().from(deliverySlots).where(eq(deliverySlots.id, slot.slotId)))[0]
      : null;
    const address: OrderAddressSnapshot = {
      contactName: input.customer.name,
      contactPhone: phone,
      line1: input.customer.line1,
      line2: null,
      landmark: input.customer.landmark ?? null,
      pincode: input.customer.pincode,
      areaName: zone?.areaNameEn ?? "Kottayam district",
      city: input.customer.city,
    };
    const [order] = await tx
      .insert(orders)
      .values({
        id: orderId,
        orderNumber: await nextOrderNumber(tx),
        userId: null,
        status: requestConfirmation ? "awaiting_confirmation" : "confirmed",
        source,
        paymentMethod: "cod",
        paymentStatus: "pending",
        address,
        pincode: address.pincode,
        zoneId: requestConfirmation ? null : zone?.id,
        slotId: slot.slotId,
        slotDate: slot.date,
        slotLabelEn: slot.labelEn,
        slotLabelMl: slotRow?.nameMl ?? "സമയം WhatsApp-ൽ സ്ഥിരീകരിക്കും",
        subtotalPaise: bill.subtotalPaise,
        discountPaise: 0,
        deliveryFeePaise: bill.deliveryFeePaise,
        gstTotalPaise: bill.gstTotalPaise,
        gstBreakdown: bill.gstBreakdown,
        grandTotalPaise: bill.grandTotalPaise,
        customerNote: input.note ?? null,
        idempotencyKey: key,
      })
      .returning();
    if (!order) throw new Error("Order insert failed");
    const savedLines = await tx
      .insert(schema.orderItems)
      .values(
        lines.map((l) => ({
          orderId,
          productId: l.productId,
          variantId: l.variantId,
          nameEn: l.nameEn,
          nameMl: l.nameMl,
          unitLabelEn: l.unitLabelEn,
          unitLabelMl: l.unitLabelMl,
          unitType: l.unitType,
          hsnCode: l.hsnCode,
          gstRate: l.gstRate,
          unitPricePaise: l.pricePaise,
          quantity: l.quantity,
          orderedQtyGrams: l.orderedQtyGrams,
          lineSubtotalPaise: l.lineSubtotalPaise,
          lineGstPaise: l.lineGstPaise,
          lineTotalPaise: l.lineSubtotalPaise,
        })),
      )
      .returning();
    await tx.insert(schema.orderStatusHistory).values({
      orderId,
      fromStatus: null,
      toStatus: requestConfirmation ? "awaiting_confirmation" : "confirmed",
      note: requestConfirmation
        ? "Guest request; delivery fee and timing will be agreed on WhatsApp"
        : `Guest ${source} order`,
    });
    await tx.insert(outboxEvents).values({
      eventName: EVENTS.orderPlaced,
      payload: {
        orderId,
        orderNumber: order.orderNumber,
        userId: null,
        paymentMethod: "cod",
        grandTotalPaise: bill.grandTotalPaise,
        slotId: slot.slotId,
        slotDate: slot.date,
        pincode: address.pincode,
        customerPhone: phone,
        customerName: input.customer.name,
        items: lines.map((l) => ({
          productId: l.productId,
          variantId: l.variantId,
          nameEn: l.nameEn,
          quantity: l.quantity,
          orderedQtyGrams: l.orderedQtyGrams,
          unitType: l.unitType,
        })),
      },
    });
    return { order, lines: savedLines, replay: false };
  });
  const { order, lines } = outcome;
  const message = buildWhatsAppOrderMessage({
    awaitingConfirmation: order.status === "awaiting_confirmation",
    orderNumber: order.orderNumber,
    source,
    customer: { name: order.address.contactName, phone: order.address.contactPhone },
    address: order.address,
    slotLabel: order.slotLabelEn,
    slotDate: order.slotDate,
    items: lines.map((l) => ({ ...l, unitType: l.unitType === "weight" ? "weight" : "unit" })),
    subtotalPaise: order.subtotalPaise,
    deliveryFeePaise: order.deliveryFeePaise,
    totalPaise: order.grandTotalPaise,
    note: order.customerNote,
  });
  return {
    awaitingConfirmation: order.status === "awaiting_confirmation",
    orderId: order.id,
    orderNumber: order.orderNumber,
    replay: outcome.replay,
    guestToken: guestOrderToken(ctx.guestTokenSecret, order.id, key),
    grandTotalPaise: order.grandTotalPaise,
    subtotalPaise: order.subtotalPaise,
    deliveryFeePaise: order.deliveryFeePaise,
    slotLabelEn: order.slotLabelEn,
    slotDate: order.slotDate,
    whatsappLink: shopPhone ? waMeLink(shopPhone, message) : "",
    shopWhatsApp: shopPhone,
    savedAddress: false,
    isNewCustomer: false,
    items: lines.map((l) => ({
      nameEn: l.nameEn,
      nameMl: l.nameMl,
      quantity: l.quantity,
      unitLabelEn: l.unitLabelEn,
      lineTotalPaise: l.lineTotalPaise,
    })),
  };
}

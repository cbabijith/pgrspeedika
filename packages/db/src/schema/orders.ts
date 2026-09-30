import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { products, productVariants } from "./catalog";
import { deliverySlots, deliveryZones } from "./delivery";
import { coupons } from "./marketing";

export const orderStatusEnum = pgEnum("order_status", [
  "pending_payment",
  "confirmed",
  "packed",
  "out_for_delivery",
  "delivered",
  "cancelled",
]);

export const paymentMethodEnum = pgEnum("payment_method", ["razorpay", "cod"]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "paid",
  "failed",
  "refunded",
  "partially_refunded",
]);

export const paymentRecordStatusEnum = pgEnum("payment_record_status", [
  "created",
  "authorized",
  "captured",
  "failed",
  "refunded",
]);

export const refundStatusEnum = pgEnum("refund_status", ["pending", "processed", "failed"]);

/** Immutable address snapshot stored on the order at placement time. */
export type OrderAddressSnapshot = {
  contactName: string;
  contactPhone: string;
  line1: string;
  line2: string | null;
  landmark: string | null;
  pincode: string;
  areaName: string;
  city: string;
};

export type GstLine = {
  rate: number;
  taxableValuePaise: number;
  taxPaise: number;
};

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderNumber: text("order_number").notNull(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    status: orderStatusEnum("status").notNull().default("pending_payment"),
    paymentMethod: paymentMethodEnum("payment_method").notNull(),
    paymentStatus: paymentStatusEnum("payment_status").notNull().default("pending"),
    address: jsonb("address").$type<OrderAddressSnapshot>().notNull(),
    /** Denormalized from the address snapshot for zone routing + filters. */
    pincode: text("pincode").notNull(),
    zoneId: uuid("zone_id").references(() => deliveryZones.id, { onDelete: "set null" }),
    slotId: uuid("slot_id").references(() => deliverySlots.id, { onDelete: "set null" }),
    slotDate: text("slot_date").notNull(),
    slotLabelEn: text("slot_label_en").notNull().default(""),
    slotLabelMl: text("slot_label_ml").notNull().default(""),
    subtotalPaise: integer("subtotal_paise").notNull(),
    discountPaise: integer("discount_paise").notNull().default(0),
    deliveryFeePaise: integer("delivery_fee_paise").notNull().default(0),
    gstTotalPaise: integer("gst_total_paise").notNull().default(0),
    gstBreakdown: jsonb("gst_breakdown").$type<GstLine[]>().notNull().default([]),
    grandTotalPaise: integer("grand_total_paise").notNull(),
    /** Final amounts after weight adjustment at packing. */
    finalSubtotalPaise: integer("final_subtotal_paise"),
    finalGrandTotalPaise: integer("final_grand_total_paise"),
    weightAdjusted: boolean("weight_adjusted").notNull().default(false),
    refundIssuedPaise: integer("refund_issued_paise").notNull().default(0),
    codCollectedPaise: integer("cod_collected_paise"),
    couponId: uuid("coupon_id").references(() => coupons.id, { onDelete: "set null" }),
    couponCode: text("coupon_code"),
    idempotencyKey: text("idempotency_key").notNull(),
    customerNote: text("customer_note"),
    internalNote: text("internal_note"),
    assignedTo: text("assigned_to").references(() => user.id, { onDelete: "set null" }),
    placedAt: timestamp("placed_at", { withTimezone: true }).notNull().defaultNow(),
    packedAt: timestamp("packed_at", { withTimezone: true }),
    outForDeliveryAt: timestamp("out_for_delivery_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancellationReason: text("cancellation_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("orders_order_number_unique").on(t.orderNumber),
    uniqueIndex("orders_idempotency_key_unique").on(t.idempotencyKey),
    index("orders_user_idx").on(t.userId, t.createdAt),
    index("orders_status_idx").on(t.status),
    index("orders_created_idx").on(t.createdAt),
    index("orders_slot_idx").on(t.slotDate, t.slotId),
    index("orders_pincode_idx").on(t.pincode),
    index("orders_payment_status_idx").on(t.paymentStatus),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    variantId: uuid("variant_id").references(() => productVariants.id, { onDelete: "set null" }),
    nameEn: text("name_en").notNull(),
    nameMl: text("name_ml").notNull(),
    unitLabelEn: text("unit_label_en").notNull(),
    unitLabelMl: text("unit_label_ml").notNull(),
    unitType: text("unit_type").notNull(),
    hsnCode: text("hsn_code").notNull().default(""),
    gstRate: integer("gst_rate").notNull().default(0),
    unitPricePaise: integer("unit_price_paise").notNull(),
    quantity: integer("quantity").notNull(),
    /** Grams ordered (weight items); equals quantity for unit items. */
    orderedQtyGrams: integer("ordered_qty_grams").notNull(),
    lineSubtotalPaise: integer("line_subtotal_paise").notNull(),
    lineGstPaise: integer("line_gst_paise").notNull().default(0),
    lineTotalPaise: integer("line_total_paise").notNull(),
    /** Actual grams after packing (weight items only). */
    finalQtyGrams: integer("final_qty_grams"),
    finalLineTotalPaise: integer("final_line_total_paise"),
    weightAdjusted: boolean("weight_adjusted").notNull().default(false),
  },
  (t) => [index("order_items_order_idx").on(t.orderId), index("order_items_product_idx").on(t.productId)],
);

export const orderStatusHistory = pgTable(
  "order_status_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    fromStatus: orderStatusEnum("from_status"),
    toStatus: orderStatusEnum("to_status").notNull(),
    note: text("note"),
    changedBy: text("changed_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("order_status_history_order_idx").on(t.orderId, t.createdAt)],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    provider: text("provider").notNull().default("razorpay"),
    providerOrderId: text("provider_order_id"),
    providerPaymentId: text("provider_payment_id"),
    method: text("method").notNull().default("upi"),
    amountPaise: integer("amount_paise").notNull(),
    status: paymentRecordStatusEnum("status").notNull().default("created"),
    idempotencyKey: text("idempotency_key"),
    requestPayload: jsonb("request_payload").$type<Record<string, unknown>>(),
    providerPayload: jsonb("provider_payload").$type<Record<string, unknown>>(),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("payments_provider_order_unique").on(t.providerOrderId),
    uniqueIndex("payments_provider_payment_unique").on(t.providerPaymentId),
    index("payments_order_idx").on(t.orderId),
  ],
);

export const refunds = pgTable(
  "refunds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    paymentId: uuid("payment_id").references(() => payments.id, { onDelete: "set null" }),
    amountPaise: integer("amount_paise").notNull(),
    reason: text("reason").notNull().default(""),
    providerRefundId: text("provider_refund_id"),
    status: refundStatusEnum("status").notNull().default("pending"),
    initiatedBy: text("initiated_by").references(() => user.id, { onDelete: "set null" }),
    providerPayload: jsonb("provider_payload").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("refunds_order_idx").on(t.orderId)],
);

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(user, { fields: [orders.userId], references: [user.id] }),
  zone: one(deliveryZones, { fields: [orders.zoneId], references: [deliveryZones.id] }),
  slot: one(deliverySlots, { fields: [orders.slotId], references: [deliverySlots.id] }),
  coupon: one(coupons, { fields: [orders.couponId], references: [coupons.id] }),
  items: many(orderItems),
  history: many(orderStatusHistory),
  payments: many(payments),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  product: one(products, { fields: [orderItems.productId], references: [products.id] }),
  variant: one(productVariants, { fields: [orderItems.variantId], references: [productVariants.id] }),
}));

export const paymentsRelations = relations(payments, ({ one, many }) => ({
  order: one(orders, { fields: [payments.orderId], references: [orders.id] }),
  refunds: many(refunds),
}));

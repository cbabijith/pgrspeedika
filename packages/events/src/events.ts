import { z } from "zod";

export const EVENTS = {
  orderPlaced: "order.placed",
  paymentCaptured: "payment.captured",
  paymentFailed: "payment.failed",
  orderConfirmed: "order.confirmed",
  orderPacked: "order.packed",
  orderOutForDelivery: "order.out_for_delivery",
  orderDelivered: "order.delivered",
  orderCancelled: "order.cancelled",
  refundIssued: "refund.issued",
  stockLow: "stock.low",
  stockDepleted: "stock.depleted",
  userRegistered: "user.registered",
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];

const orderRef = {
  orderId: z.string().uuid(),
  orderNumber: z.string(),
  userId: z.string().nullable(),
};

export const orderPlacedPayloadSchema = z.object({
  ...orderRef,
  paymentMethod: z.enum(["razorpay", "cod"]),
  grandTotalPaise: z.number().int(),
  slotId: z.string().uuid().nullable(),
  slotDate: z.string(),
  pincode: z.string(),
  customerPhone: z.string(),
  customerName: z.string(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        variantId: z.string().uuid(),
        nameEn: z.string(),
        quantity: z.number().int(),
        orderedQtyGrams: z.number().int(),
        unitType: z.enum(["weight", "unit"]),
      }),
    )
    .min(1),
});
export type OrderPlacedPayload = z.infer<typeof orderPlacedPayloadSchema>;

export const orderStatusPayloadSchema = z.object({
  ...orderRef,
  grandTotalPaise: z.number().int(),
  customerPhone: z.string().nullable(),
  customerName: z.string().nullable(),
  note: z.string().nullable().default(null),
});
export type OrderStatusPayload = z.infer<typeof orderStatusPayloadSchema>;

export const orderPackedPayloadSchema = orderStatusPayloadSchema.extend({
  finalGrandTotalPaise: z.number().int().nullable(),
  refundDuePaise: z.number().int(),
  collectDuePaise: z.number().int(),
});
export type OrderPackedPayload = z.infer<typeof orderPackedPayloadSchema>;

export const paymentPayloadSchema = z.object({
  ...orderRef,
  paymentId: z.string().uuid().nullable(),
  providerOrderId: z.string().nullable(),
  providerPaymentId: z.string().nullable(),
  amountPaise: z.number().int(),
  method: z.string(),
});
export type PaymentPayload = z.infer<typeof paymentPayloadSchema>;

export const refundPayloadSchema = z.object({
  ...orderRef,
  refundId: z.string().uuid(),
  amountPaise: z.number().int(),
  reason: z.string(),
  paymentMethod: z.enum(["razorpay", "cod"]),
});
export type RefundPayload = z.infer<typeof refundPayloadSchema>;

export const stockPayloadSchema = z.object({
  productId: z.string().uuid(),
  nameEn: z.string(),
  available: z.number().int(),
  lowStockThreshold: z.number().int(),
});
export type StockPayload = z.infer<typeof stockPayloadSchema>;

export const userRegisteredPayloadSchema = z.object({
  userId: z.string(),
  name: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  role: z.string(),
});
export type UserRegisteredPayload = z.infer<typeof userRegisteredPayloadSchema>;

/** Compile-time mapping of event name → payload schema. */
export const EVENT_SCHEMAS = {
  [EVENTS.orderPlaced]: orderPlacedPayloadSchema,
  [EVENTS.paymentCaptured]: paymentPayloadSchema,
  [EVENTS.paymentFailed]: paymentPayloadSchema,
  [EVENTS.orderConfirmed]: orderStatusPayloadSchema,
  [EVENTS.orderPacked]: orderPackedPayloadSchema,
  [EVENTS.orderOutForDelivery]: orderStatusPayloadSchema,
  [EVENTS.orderDelivered]: orderStatusPayloadSchema,
  [EVENTS.orderCancelled]: orderStatusPayloadSchema,
  [EVENTS.refundIssued]: refundPayloadSchema,
  [EVENTS.stockLow]: stockPayloadSchema,
  [EVENTS.stockDepleted]: stockPayloadSchema,
  [EVENTS.userRegistered]: userRegisteredPayloadSchema,
} as const satisfies Record<EventName, z.ZodTypeAny>;

export type EventPayloadMap = {
  [K in EventName]: z.infer<(typeof EVENT_SCHEMAS)[K]>;
};

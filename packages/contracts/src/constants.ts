export const LANGS = ["en", "ml"] as const;
export type Lang = (typeof LANGS)[number];

export const ORDER_STATUSES = [
  "awaiting_confirmation",
  "pending_payment",
  "confirmed",
  "packed",
  "out_for_delivery",
  "delivered",
  "cancelled",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Customer-facing timeline (pending_payment is an internal/transient state). */
export const ORDER_TIMELINE: OrderStatus[] = ["confirmed", "packed", "out_for_delivery", "delivered"];

export const ORDER_STATUS_LABEL: Record<OrderStatus, { en: string; ml: string }> = {
  awaiting_confirmation: { en: "Awaiting shop confirmation", ml: "കടയുടെ സ്ഥിരീകരണം കാത്തിരിക്കുന്നു" },
  pending_payment: { en: "Awaiting payment", ml: "പേയ്മെന്റ് കാത്തിരിക്കുന്നു" },
  confirmed: { en: "Order placed", ml: "ഓർഡർ സ്വീകരിച്ചു" },
  packed: { en: "Packed", ml: "പായ്ക്ക് ചെയ്തു" },
  out_for_delivery: { en: "Out for delivery", ml: "ഡെലിവറിക്ക് പുറപ്പെട്ടു" },
  delivered: { en: "Delivered", ml: "എത്തിച്ചു" },
  cancelled: { en: "Cancelled", ml: "റദ്ദാക്കി" },
};

export const STAFF_ROLES = ["owner", "manager", "packer", "delivery"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];
export type UserRole = StaffRole | "customer";

export const PAYMENT_METHODS = ["razorpay", "cod"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const ERROR_CODES = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  RATE_LIMITED: "RATE_LIMITED",
  OUT_OF_STOCK: "OUT_OF_STOCK",
  SLOT_UNAVAILABLE: "SLOT_UNAVAILABLE",
  ZONE_NOT_SERVED: "ZONE_NOT_SERVED",
  MIN_ORDER_NOT_MET: "MIN_ORDER_NOT_MET",
  COUPON_INVALID: "COUPON_INVALID",
  PAYMENT_FAILED: "PAYMENT_FAILED",
  IDEMPOTENCY_REPLAY: "IDEMPOTENCY_REPLAY",
  INTERNAL: "INTERNAL",
} as const;
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** Cancellation is allowed until the order is packed. */
export function isCancellable(status: OrderStatus): boolean {
  return status === "confirmed" || status === "pending_payment" || status === "awaiting_confirmation";
}

/** Ordered minutes-from-midnight → "7:00 AM". */
export function formatMinutes(minutes: number): string {
  const h24 = Math.floor(minutes / 60);
  const m = minutes % 60;
  const ampm = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return m === 0 ? `${h12}:00 ${ampm}` : `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

import { z } from "zod";
import { phoneSchema, pincodeSchema } from "./common";

export const ORDER_SOURCES = ["web", "whatsapp"] as const;
export type OrderSource = (typeof ORDER_SOURCES)[number];

/** Item lines for a WhatsApp order: exact variants (from the web cart) with quantities. */
export const whatsappOrderItemSchema = z.object({
  variantId: z.string().uuid(),
  quantity: z.number().int().min(1).max(99),
});

export const whatsappOrderSchema = z.object({
  items: z.array(whatsappOrderItemSchema).min(1).max(60),
  customer: z.object({
    name: z.string().min(2, "Name is required").max(80),
    phone: phoneSchema,
    line1: z.string().min(4, "House / street is required").max(200),
    landmark: z.string().max(120).nullish(),
    pincode: pincodeSchema,
    city: z.string().min(2).max(60).default("Kannur"),
  }),
  slotId: z.string().uuid().optional(),
  note: z.string().max(500).nullish(),
  idempotencyKey: z.string().min(8).max(80).optional(),
});
export type WhatsAppOrderRequest = z.infer<typeof whatsappOrderSchema>;

export const whatsappCustomerLookupSchema = z.object({
  phone: phoneSchema,
});

export type WhatsAppOrderResult = {
  orderId: string;
  orderNumber: string;
  grandTotalPaise: number;
  subtotalPaise: number;
  deliveryFeePaise: number;
  slotLabelEn: string;
  slotDate: string;
  /** wa.me deep link with the full order pre-filled for the customer to send. */
  whatsappLink: string;
  shopWhatsApp: string;
  savedAddress: boolean;
  isNewCustomer: boolean;
  items: Array<{
    nameEn: string;
    nameMl: string;
    quantity: number;
    unitLabelEn: string;
    lineTotalPaise: number;
  }>;
};

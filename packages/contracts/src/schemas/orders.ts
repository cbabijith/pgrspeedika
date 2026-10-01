import { z } from "zod";
import { uuidSchema } from "./common";
import type { OrderStatus, PaymentMethod } from "../constants";

export type OrderItemDTO = {
  id: string;
  productId: string | null;
  variantId: string | null;
  productSlug: string | null;
  nameEn: string;
  nameMl: string;
  unitLabelEn: string;
  unitLabelMl: string;
  unitType: string;
  hsnCode: string;
  gstRate: number;
  unitPricePaise: number;
  quantity: number;
  orderedQtyGrams: number;
  finalQtyGrams: number | null;
  lineSubtotalPaise: number;
  lineGstPaise: number;
  lineTotalPaise: number;
  finalLineTotalPaise: number | null;
  weightAdjusted: boolean;
  imageUrl: string | null;
};

export type OrderEventDTO = {
  id: string;
  fromStatus: string | null;
  toStatus: OrderStatus;
  note: string | null;
  createdAt: string;
};

export type PaymentDTO = {
  id: string;
  provider: string;
  method: string;
  amountPaise: number;
  status: string;
  providerOrderId: string | null;
  providerPaymentId: string | null;
  createdAt: string;
};

export type RefundDTO = {
  id: string;
  amountPaise: number;
  reason: string;
  status: string;
  providerRefundId: string | null;
  createdAt: string;
};

export type OrderDTO = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  source: string;
  paymentMethod: PaymentMethod;
  paymentStatus: string;
  address: {
    contactName: string;
    contactPhone: string;
    line1: string;
    line2: string | null;
    landmark: string | null;
    pincode: string;
    areaName: string;
    city: string;
  };
  slotDate: string;
  slotLabelEn: string;
  slotLabelMl: string;
  subtotalPaise: number;
  discountPaise: number;
  deliveryFeePaise: number;
  gstTotalPaise: number;
  gstBreakdown: Array<{ rate: number; taxableValuePaise: number; taxPaise: number }>;
  grandTotalPaise: number;
  finalSubtotalPaise: number | null;
  finalGrandTotalPaise: number | null;
  weightAdjusted: boolean;
  refundIssuedPaise: number;
  codCollectedPaise: number | null;
  couponCode: string | null;
  customerNote: string | null;
  placedAt: string;
  packedAt: string | null;
  outForDeliveryAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  items: OrderItemDTO[];
  history: OrderEventDTO[];
  payments: PaymentDTO[];
  refunds: RefundDTO[];
  assignedToId: string | null;
  assignedToName: string | null;
};

export const cancelOrderSchema = z.object({
  reason: z.string().min(3).max(300),
});

export const weightAdjustmentSchema = z.object({
  items: z
    .array(
      z.object({
        itemId: uuidSchema,
        finalQtyGrams: z.number().int().min(0).max(100000),
      }),
    )
    .min(1)
    .max(100),
});

export const orderFiltersSchema = z.object({
  status: z.string().optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  slotId: uuidSchema.optional(),
  pincode: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
  q: z.string().max(80).optional(),
});

export const assignOrderSchema = z.object({
  userId: uuidSchema.nullable(),
});

export const codCollectSchema = z.object({
  amountPaise: z.number().int().min(0),
});

export const refundInputSchema = z.object({
  amountPaise: z.number().int().min(1),
  reason: z.string().min(3).max(300),
});

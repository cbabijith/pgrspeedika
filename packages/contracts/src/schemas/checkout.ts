import { z } from "zod";
import { phoneSchema, pincodeSchema, uuidSchema } from "./common";

export const addressInputSchema = z.object({
  label: z.string().min(1).max(40).default("Home"),
  contactName: z.string().min(2).max(80),
  contactPhone: phoneSchema,
  line1: z.string().min(4).max(200),
  line2: z.string().max(200).nullish(),
  landmark: z.string().max(120).nullish(),
  pincode: pincodeSchema,
  areaName: z.string().max(80).optional(),
  city: z.string().min(2).max(60),
  isDefault: z.boolean().default(false),
});
export type AddressInput = z.infer<typeof addressInputSchema>;

export const addressSchema = addressInputSchema.extend({
  id: uuidSchema,
  areaName: z.string().nullable(),
  userId: uuidSchema.optional(),
});
export type Address = z.infer<typeof addressSchema>;

export const placeOrderSchema = z
  .object({
    addressId: uuidSchema.optional(),
    address: addressInputSchema.optional(),
    slotId: uuidSchema,
    slotDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
    paymentMethod: z.enum(["razorpay", "cod"]),
    couponCode: z.string().min(2).max(30).nullish(),
    customerNote: z.string().max(500).nullish(),
    idempotencyKey: z.string().min(8).max(80),
  })
  .refine((v) => Boolean(v.addressId ?? v.address), {
    message: "Provide addressId or a new address",
    path: ["addressId"],
  });
export type PlaceOrderRequest = z.infer<typeof placeOrderSchema>;

export const verifyPaymentSchema = z.object({
  razorpayOrderId: z.string().min(4).max(80),
  razorpayPaymentId: z.string().min(4).max(80),
  razorpaySignature: z.string().min(16).max(256),
});

export const zoneCheckSchema = z.object({
  pincode: pincodeSchema,
});

export type ZoneDTO = {
  id: string;
  pincode: string;
  areaNameEn: string;
  areaNameMl: string;
  minOrderPaise: number;
  deliveryFeePaise: number;
  freeDeliveryThresholdPaise: number | null;
  isActive: boolean;
};

export type SlotDTO = {
  id: string;
  nameEn: string;
  nameMl: string;
  startMinutes: number;
  endMinutes: number;
  cutoffMinutes: number;
  capacity: number;
  isActive: boolean;
};

export type SlotAvailability = SlotDTO & {
  date: string;
  remaining: number;
  /** True once the cutoff has passed for this date. */
  cutoffPassed: boolean;
  /** True on holiday/closed days configured by the shop. */
  closed: boolean;
  bookable: boolean;
};

import { z } from "zod";
import { pincodeSchema, uuidSchema } from "./common";

export const zoneInputSchema = z.object({
  pincode: pincodeSchema,
  areaNameEn: z.string().min(2).max(80),
  areaNameMl: z.string().max(120).default(""),
  minOrderPaise: z.number().int().min(0).max(100000000),
  deliveryFeePaise: z.number().int().min(0).max(100000000),
  freeDeliveryThresholdPaise: z.number().int().min(0).nullish(),
  isActive: z.boolean().default(true),
});

export const slotInputSchema = z.object({
  nameEn: z.string().min(3).max(60),
  nameMl: z.string().min(3).max(100),
  startMinutes: z.number().int().min(0).max(1439),
  endMinutes: z.number().int().min(1).max(1440),
  cutoffMinutes: z.number().int().min(0).max(1440).default(240),
  capacity: z.number().int().min(1).max(2000).default(50),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
});

export const couponInputSchema = z.object({
  code: z
    .string()
    .min(3)
    .max(30)
    .regex(/^[A-Z0-9_-]+$/, "Uppercase letters, digits, - and _"),
  couponType: z.enum(["percent", "flat"]),
  value: z.number().int().min(1),
  minOrderPaise: z.number().int().min(0).default(0),
  maxDiscountPaise: z.number().int().min(1).nullish(),
  usageLimit: z.number().int().min(1).nullish(),
  perUserLimit: z.number().int().min(1).default(1),
  validFrom: z.string().datetime().nullish(),
  validUntil: z.string().datetime().nullish(),
  firstOrderOnly: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

export const bannerInputSchema = z.object({
  titleEn: z.string().min(3).max(120),
  titleMl: z.string().min(3).max(200),
  subtitleEn: z.string().max(200).nullish(),
  subtitleMl: z.string().max(300).nullish(),
  imageUrl: z.string().min(3).max(1000),
  linkUrl: z.string().max(500).nullish(),
  badge: z.string().max(40).nullish(),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
  startsAt: z.string().datetime().nullish(),
  endsAt: z.string().datetime().nullish(),
});

export const inventoryAdjustSchema = z.object({
  productId: uuidSchema,
  /** Signed delta: grams for loose goods, units for packaged. */
  quantityDelta: z.number().int(),
  reason: z.string().min(2).max(200),
  movementType: z.enum(["purchase", "adjustment"]).default("adjustment"),
});

export const staffInviteSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email(),
  password: z.string().min(10).max(100),
  role: z.enum(["owner", "manager", "packer", "delivery"]),
});

export const staffUpdateSchema = z.object({
  role: z.enum(["owner", "manager", "packer", "delivery"]).optional(),
  banned: z.boolean().optional(),
});

export const shopSettingsSchema = z.object({
  name: z.string().min(2).max(80),
  tagline: z.string().max(120).default(""),
  phone: z.string().max(20),
  whatsapp: z.string().max(20),
  email: z.string().email().or(z.literal("")),
  addressLine: z.string().max(200),
  gstin: z
    .string()
    .max(15)
    .regex(/^[0-9A-Z]*$/, "GSTIN is 15 uppercase letters/digits")
    .default(""),
  openTime: z.string().regex(/^\d{2}:\d{2}$/),
  closeTime: z.string().regex(/^\d{2}:\d{2}$/),
  weeklyClosedDay: z
    .enum(["none", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"])
    .default("none"),
});
export type ShopSettings = z.infer<typeof shopSettingsSchema>;

export const uploadRequestSchema = z.object({
  fileName: z
    .string()
    .min(3)
    .max(200)
    .regex(/^[\w\-. ]+$/, "Invalid file name"),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp", "image/svg+xml"]),
  sizeBytes: z
    .number()
    .int()
    .min(1)
    .max(10 * 1024 * 1024),
});

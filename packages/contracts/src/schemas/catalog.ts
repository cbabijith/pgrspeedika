import { z } from "zod";
import { paginationQuerySchema, uuidSchema } from "./common";

export const categorySchema = z.object({
  id: uuidSchema,
  slug: z.string(),
  nameEn: z.string(),
  nameMl: z.string(),
  description: z.string().nullable(),
  imageUrl: z.string().nullable(),
  sortOrder: z.number(),
  isActive: z.boolean(),
  productCount: z.number().optional(),
});
export type Category = z.infer<typeof categorySchema>;

export const variantSchema = z.object({
  id: uuidSchema,
  sku: z.string(),
  unitType: z.enum(["weight", "unit"]),
  baseQuantity: z.number().int(),
  labelEn: z.string(),
  labelMl: z.string(),
  pricePaise: z.number().int(),
  mrpPaise: z.number().int().nullable(),
  stepQuantity: z.number().int(),
  sortOrder: z.number(),
  isActive: z.boolean(),
});
export type Variant = z.infer<typeof variantSchema>;

export const productCardSchema = z.object({
  id: uuidSchema,
  slug: z.string(),
  nameEn: z.string(),
  nameMl: z.string(),
  sellingType: z.enum(["loose", "packaged"]),
  isFreshToday: z.boolean(),
  gstRate: z.number(),
  categoryId: uuidSchema,
  categorySlug: z.string(),
  imageUrl: z.string().nullable(),
  variants: z.array(variantSchema),
  /** Grams (loose) or units (packaged) available to sell; null when untracked. */
  availableQuantity: z.number().int().nullable(),
  lowStock: z.boolean(),
  ratingAvg: z.number(),
  ratingCount: z.number().int(),
  soldCount: z.number().int(),
});
export type ProductCard = z.infer<typeof productCardSchema>;

export const productDetailSchema = productCardSchema.extend({
  description: z.string().nullable(),
  brand: z.string().nullable(),
  hsnCode: z.string(),
  images: z.array(z.object({ url: z.string(), alt: z.string().nullable() })),
});
export type ProductDetail = z.infer<typeof productDetailSchema>;

export const listProductsQuerySchema = paginationQuerySchema.extend({
  categorySlug: z.string().optional(),
  q: z.string().max(120).optional(),
  inStock: z.coerce.boolean().optional(),
  freshToday: z.coerce.boolean().optional(),
  sort: z.enum(["popular", "price_asc", "price_desc", "name_asc", "name_desc"]).default("popular"),
});
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;

export const searchSuggestSchema = z.object({
  suggestions: z.array(
    z.object({
      slug: z.string(),
      nameEn: z.string(),
      nameMl: z.string(),
      imageUrl: z.string().nullable(),
      pricePaise: z.number().int(),
      categorySlug: z.string(),
    }),
  ),
});

export const categoryInputSchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "Use lowercase letters, digits and dashes"),
  nameEn: z.string().min(2).max(80),
  nameMl: z.string().min(2).max(80),
  description: z.string().max(500).nullish(),
  imageUrl: z.string().max(500).nullish(),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

export const variantInputSchema = z.object({
  id: uuidSchema.optional(),
  sku: z.string().min(2).max(60).optional(),
  unitType: z.enum(["weight", "unit"]),
  baseQuantity: z.number().int().min(1),
  labelEn: z.string().min(1).max(40),
  labelMl: z.string().min(1).max(60),
  pricePaise: z.number().int().min(0),
  mrpPaise: z.number().int().min(0).nullish(),
  stepQuantity: z.number().int().min(1).default(250),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

export const productInputSchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9-]+$/, "Use lowercase letters, digits and dashes"),
  categoryId: uuidSchema,
  nameEn: z.string().min(2).max(120),
  nameMl: z.string().min(2).max(160),
  description: z.string().max(3000).nullish(),
  brand: z.string().max(80).nullish(),
  hsnCode: z.string().max(10).default(""),
  gstRate: z
    .number()
    .int()
    .min(0)
    .max(28)
    .refine((r) => [0, 5, 12, 18, 28].includes(r), {
      message: "GST rate must be one of 0, 5, 12, 18, 28",
    }),
  sellingType: z.enum(["loose", "packaged"]),
  isFreshToday: z.boolean().default(false),
  isActive: z.boolean().default(true),
  searchKeywords: z.string().max(500).default(""),
  images: z
    .array(z.object({ url: z.string().min(1).max(1000), alt: z.string().max(200).nullish() }))
    .max(8)
    .default([]),
  variants: z.array(variantInputSchema).min(1).max(12),
  initialStock: z.number().int().min(0).optional(),
  lowStockThreshold: z.number().int().min(0).default(0),
});
export type ProductInput = z.infer<typeof productInputSchema>;

export const priceUpdateItemSchema = z.object({
  variantId: uuidSchema,
  pricePaise: z.number().int().min(0),
  mrpPaise: z.number().int().min(0).nullish(),
});

export const quickPriceUpdateSchema = z.object({
  updates: z.array(priceUpdateItemSchema).min(1).max(1000),
});

export const bulkPriceChangeSchema = z.object({
  /** Category filter for the bulk change, null = all. */
  categorySlug: z.string().nullish(),
  /** Signed percentage change, e.g. -5 for 5% cheaper. */
  percentChange: z.number().min(-90).max(200),
});

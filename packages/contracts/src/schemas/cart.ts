import { z } from "zod";
import { uuidSchema } from "./common";
import type { ProductCard } from "./catalog";

export const cartItemInputSchema = z.object({
  variantId: uuidSchema,
  quantity: z.number().int().min(1).max(99),
});

export const addCartItemsSchema = z.object({
  items: z.array(cartItemInputSchema).min(1).max(60),
});

export const updateCartItemSchema = z.object({
  quantity: z.number().int().min(0).max(99),
});

export const applyCouponSchema = z.object({
  code: z.string().min(2).max(30),
});

/** Client-side cart line (Zustand persist shape for guests). */
export const localCartLineSchema = z.object({
  variantId: uuidSchema,
  quantity: z.number().int().min(1).max(99),
});

export const mergeGuestCartSchema = z.object({
  items: z.array(localCartLineSchema).max(60),
});

export type CartLine = {
  itemId: string;
  variantId: string;
  productId: string;
  nameEn: string;
  nameMl: string;
  imageUrl: string | null;
  unitType: "weight" | "unit";
  unitLabelEn: string;
  unitLabelMl: string;
  unitPricePaise: number;
  mrpPaise: number | null;
  quantity: number;
  lineTotalPaise: number;
  lineGstPaise: number;
  gstRate: number;
  availableQuantity: number | null;
};

export type CartTotals = {
  subtotalPaise: number;
  discountPaise: number;
  deliveryFeePaise: number | null;
  grandTotalPaise: number | null;
  freeDeliveryGapPaise: number | null;
  gstTotalPaise: number;
  minOrderPaise: number | null;
};

export type CartDTO = {
  items: CartLine[];
  totals: CartTotals;
  couponCode: string | null;
  itemCount: number;
};

export type ProductWithVariants = Pick<
  ProductCard,
  "id" | "slug" | "nameEn" | "nameMl" | "sellingType" | "imageUrl"
> & {
  variants: Array<{
    id: string;
    pricePaise: number;
    labelEn: string;
    labelMl: string;
    unitType: "weight" | "unit";
    baseQuantity: number;
    stepQuantity: number;
    isActive: boolean;
  }>;
};

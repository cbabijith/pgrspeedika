import { and, eq, sql } from "drizzle-orm";
import type { Database } from "@pgrs/db";
import { cartItems, carts, coupons, deliveryZones, inventory, productVariants, products } from "@pgrs/db";
import type { CartDTO, CartLine, CartTotals } from "@pgrs/contracts";
import { gstFromInclusive } from "@pgrs/contracts";
import { badRequest, couponInvalid, notFound } from "../lib/errors";
import { computeBill } from "./pricing";
import { validateCoupon } from "./coupons";

export async function getOrCreateCart(db: Database, userId: string) {
  const [existing] = await db.select().from(carts).where(eq(carts.userId, userId));
  if (existing) return existing;
  const [created] = await db.insert(carts).values({ userId }).returning();
  if (!created) throw new Error("Failed to create cart");
  return created;
}

export async function getCartDTO(db: Database, userId: string, zonePincode?: string): Promise<CartDTO> {
  const cart = await getOrCreateCart(db, userId);
  const rows = await db
    .select({
      itemId: cartItems.id,
      quantity: cartItems.quantity,
      variant: productVariants,
      product: products,
      stock: inventory.stockQuantity,
      reserved: inventory.reservedQuantity,
      track: sql<boolean>`coalesce(${inventory.trackStock}, true)`,
      imageUrl: sql<
        string | null
      >`(select pi.url from product_images pi where pi.product_id = ${products.id} order by pi.sort_order asc limit 1)`,
    })
    .from(cartItems)
    .innerJoin(productVariants, eq(cartItems.variantId, productVariants.id))
    .innerJoin(products, eq(cartItems.productId, products.id))
    .leftJoin(inventory, eq(inventory.productId, products.id))
    .where(eq(cartItems.cartId, cart.id));

  const lines: CartLine[] = rows.map((r) => {
    const available = r.track ? Math.max(0, (r.stock ?? 0) - (r.reserved ?? 0)) : null;
    const lineTotal = r.variant.pricePaise * r.quantity;
    return {
      itemId: r.itemId,
      variantId: r.variant.id,
      productId: r.product.id,
      nameEn: r.product.nameEn,
      nameMl: r.product.nameMl,
      imageUrl: r.imageUrl,
      unitType: r.variant.unitType,
      unitLabelEn: r.variant.labelEn,
      unitLabelMl: r.variant.labelMl,
      unitPricePaise: r.variant.pricePaise,
      mrpPaise: r.variant.mrpPaise,
      quantity: r.quantity,
      lineTotalPaise: lineTotal,
      lineGstPaise: gstFromInclusive(lineTotal, r.product.gstRate),
      gstRate: r.product.gstRate,
      availableQuantity: r.variant.unitType === "weight" ? available : available,
    };
  });

  const subtotal = lines.reduce((s, l) => s + l.lineTotalPaise, 0);
  const gstTotal = lines.reduce((s, l) => s + l.lineGstPaise, 0);

  let zone: typeof deliveryZones.$inferSelect | null = null;
  if (zonePincode) {
    const [z] = await db
      .select()
      .from(deliveryZones)
      .where(and(eq(deliveryZones.pincode, zonePincode), eq(deliveryZones.isActive, true)));
    zone = z ?? null;
  }

  let couponCode: string | null = null;
  let discountPaise = 0;
  if (cart.couponId) {
    const [c] = await db.select().from(coupons).where(eq(coupons.id, cart.couponId));
    if (c) {
      couponCode = c.code;
      try {
        const result = validateCoupon({
          coupon: c,
          subtotalPaise: subtotal,
          now: new Date(),
          isActive: true,
          userRedemptionCount: 0,
          isFirstOrder: true,
        });
        discountPaise = result.discountPaise;
      } catch {
        couponCode = null;
      }
    }
  }

  const bill = computeBill(
    lines.map((l) => ({
      unitPricePaise: l.unitPricePaise,
      quantity: l.quantity,
      baseQuantity: 1,
      unitType: l.unitType,
      gstRate: l.gstRate,
    })),
    discountPaise > 0 && couponCode
      ? {
          // Reconstruct a coupon-like from the validated discount
          couponType: "flat" as const,
          value: discountPaise,
          maxDiscountPaise: null,
        }
      : null,
    zone,
  );

  const totals: CartTotals = {
    subtotalPaise: subtotal,
    discountPaise: bill.discountPaise,
    deliveryFeePaise: zone ? bill.deliveryFeePaise : null,
    grandTotalPaise: zone ? bill.grandTotalPaise : null,
    freeDeliveryGapPaise:
      zone && zone.freeDeliveryThresholdPaise != null
        ? Math.max(0, zone.freeDeliveryThresholdPaise - (subtotal - bill.discountPaise))
        : null,
    gstTotalPaise: gstTotal,
    minOrderPaise: zone ? zone.minOrderPaise : null,
  };

  return {
    items: lines,
    totals,
    couponCode,
    itemCount: lines.reduce((s, l) => s + l.quantity, 0),
  };
}

export async function addItems(
  db: Database,
  userId: string,
  items: Array<{ variantId: string; quantity: number }>,
): Promise<CartDTO> {
  const cart = await getOrCreateCart(db, userId);
  for (const item of items) {
    const [variant] = await db
      .select({
        id: productVariants.id,
        productId: productVariants.productId,
        isActive: productVariants.isActive,
      })
      .from(productVariants)
      .where(eq(productVariants.id, item.variantId));
    if (!variant || !variant.isActive) throw notFound("Product variant not found");
    await db
      .insert(cartItems)
      .values({
        cartId: cart.id,
        productId: variant.productId,
        variantId: variant.id,
        quantity: item.quantity,
      })
      .onConflictDoUpdate({
        target: [cartItems.cartId, cartItems.variantId],
        set: { quantity: sql`least(${cartItems.quantity} + ${item.quantity}, 99)` },
      });
  }
  return getCartDTO(db, userId);
}

export async function updateItem(
  db: Database,
  userId: string,
  variantId: string,
  quantity: number,
): Promise<CartDTO> {
  const cart = await getOrCreateCart(db, userId);
  if (quantity <= 0) {
    await db.delete(cartItems).where(and(eq(cartItems.cartId, cart.id), eq(cartItems.variantId, variantId)));
    return getCartDTO(db, userId);
  }
  const updated = await db
    .update(cartItems)
    .set({ quantity })
    .where(and(eq(cartItems.cartId, cart.id), eq(cartItems.variantId, variantId)))
    .returning({ id: cartItems.id });
  if (updated.length === 0) throw notFound("Cart item not found");
  return getCartDTO(db, userId);
}

export async function removeItem(db: Database, userId: string, variantId: string): Promise<CartDTO> {
  const cart = await getOrCreateCart(db, userId);
  await db.delete(cartItems).where(and(eq(cartItems.cartId, cart.id), eq(cartItems.variantId, variantId)));
  return getCartDTO(db, userId);
}

export async function applyCouponToCart(db: Database, userId: string, code: string): Promise<CartDTO> {
  const cart = await getOrCreateCart(db, userId);
  const [coupon] = await db.select().from(coupons).where(eq(coupons.code, code.toUpperCase()));
  if (!coupon) throw couponInvalid("Coupon code not found");

  const dto = await getCartDTO(db, userId);
  if (dto.items.length === 0) throw badRequest("Your cart is empty");

  validateCoupon({
    coupon,
    subtotalPaise: dto.totals.subtotalPaise,
    now: new Date(),
    isActive: true,
    userRedemptionCount: 0,
    isFirstOrder: true,
  });

  await db.update(carts).set({ couponId: coupon.id }).where(eq(carts.id, cart.id));
  return getCartDTO(db, userId);
}

export async function removeCoupon(db: Database, userId: string): Promise<CartDTO> {
  const cart = await getOrCreateCart(db, userId);
  await db.update(carts).set({ couponId: null }).where(eq(carts.id, cart.id));
  return getCartDTO(db, userId);
}

/** Merge a guest (browser) cart into the user's server cart at login. */
export async function mergeGuestCart(
  db: Database,
  userId: string,
  items: Array<{ variantId: string; quantity: number }>,
): Promise<CartDTO> {
  if (items.length === 0) return getCartDTO(db, userId);
  try {
    return await addItems(db, userId, items);
  } catch (err) {
    if (err instanceof Error && "status" in err === false) {
      throw badRequest("Some cart items are no longer available");
    }
    throw err;
  }
}

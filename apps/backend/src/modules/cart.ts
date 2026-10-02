import { servedZoneCondition } from "../services/delivery-area";
import { newHono } from "../lib/hono";
import { zValidator } from "@hono/zod-validator";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import {
  addCartItemsSchema,
  applyCouponSchema,
  gstFromInclusive,
  mergeGuestCartSchema,
  updateCartItemSchema,
  type CartDTO,
  type CartLine,
} from "@pgrs/contracts";
import { categories, deliveryZones, inventory, productVariants, products } from "@pgrs/db";
import type { AppContext } from "../lib/app-context";
import { ok } from "../lib/errors";
import { requireAuth } from "../lib/context";
import {
  addItems,
  applyCouponToCart,
  getCartDTO,
  mergeGuestCart,
  removeCoupon,
  removeItem,
  updateItem,
} from "../services/cart";

/** Public pricing preview for guest carts (no session required). */
async function previewCart(
  ctx: AppContext,
  items: Array<{ variantId: string; quantity: number }>,
  pincode?: string,
): Promise<CartDTO> {
  if (items.length === 0) {
    return {
      items: [],
      totals: {
        subtotalPaise: 0,
        discountPaise: 0,
        deliveryFeePaise: null,
        grandTotalPaise: null,
        freeDeliveryGapPaise: null,
        gstTotalPaise: 0,
        minOrderPaise: null,
      },
      couponCode: null,
      itemCount: 0,
    };
  }
  const rows = await ctx.db
    .select({
      variantId: productVariants.id,
      pricePaise: productVariants.pricePaise,
      labelEn: productVariants.labelEn,
      labelMl: productVariants.labelMl,
      unitType: productVariants.unitType,
      isActive: productVariants.isActive,
      nameEn: products.nameEn,
      nameMl: products.nameMl,
      gstRate: products.gstRate,
      productId: products.id,
      stock: inventory.stockQuantity,
      reserved: inventory.reservedQuantity,
      track: sql<boolean>`coalesce(${inventory.trackStock}, true)`,
      imageUrl: sql<
        string | null
      >`(select pi.url from product_images pi where pi.product_id = ${products.id} order by pi.sort_order asc limit 1)`,
    })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .leftJoin(inventory, eq(inventory.productId, products.id))
    .where(
      and(
        eq(products.isActive, true),
        eq(categories.isActive, true),
        inArray(
          productVariants.id,
          items.map((i) => i.variantId),
        ),
      ),
    );

  const lines: CartLine[] = items.flatMap((item) => {
    const row = rows.find((r) => r.variantId === item.variantId);
    if (!row || !row.isActive) return [];
    const available = row.track ? Math.max(0, (row.stock ?? 0) - (row.reserved ?? 0)) : null;
    const lineTotal = row.pricePaise * item.quantity;
    return [
      {
        itemId: row.variantId,
        variantId: row.variantId,
        productId: row.productId,
        nameEn: row.nameEn,
        nameMl: row.nameMl,
        imageUrl: row.imageUrl,
        unitType: row.unitType,
        unitLabelEn: row.labelEn,
        unitLabelMl: row.labelMl,
        unitPricePaise: row.pricePaise,
        mrpPaise: null,
        quantity: item.quantity,
        lineTotalPaise: lineTotal,
        lineGstPaise: gstFromInclusive(lineTotal, row.gstRate),
        gstRate: row.gstRate,
        availableQuantity: available,
      },
    ];
  });

  const subtotal = lines.reduce((s, l) => s + l.lineTotalPaise, 0);
  const gstTotal = lines.reduce((s, l) => s + l.lineGstPaise, 0);
  let zone: typeof deliveryZones.$inferSelect | null = null;
  if (pincode) {
    const [z] = await ctx.db.select().from(deliveryZones).where(servedZoneCondition(pincode));
    zone = z ?? null;
  }
  const deliveryFee =
    zone == null
      ? null
      : zone.freeDeliveryThresholdPaise != null && subtotal >= zone.freeDeliveryThresholdPaise
        ? 0
        : zone.deliveryFeePaise;

  return {
    items: lines,
    totals: {
      subtotalPaise: subtotal,
      discountPaise: 0,
      deliveryFeePaise: deliveryFee,
      grandTotalPaise: zone ? subtotal + (deliveryFee ?? 0) : null,
      freeDeliveryGapPaise:
        zone && zone.freeDeliveryThresholdPaise != null
          ? Math.max(0, zone.freeDeliveryThresholdPaise - subtotal)
          : null,
      gstTotalPaise: gstTotal,
      minOrderPaise: zone ? zone.minOrderPaise : null,
    },
    couponCode: null,
    itemCount: lines.reduce((s, l) => s + l.quantity, 0),
  };
}

const previewQuerySchema = z.object({
  pincode: z
    .string()
    .regex(/^[1-9]\d{5}$/)
    .optional(),
});

export function cartRoutes(ctx: AppContext) {
  return newHono()
    .post(
      "/api/cart/preview",
      zValidator("query", previewQuerySchema, (result, c) => {
        if (!result.success)
          return c.json({ ok: false as const, code: "VALIDATION_ERROR", message: "Invalid pincode" }, 400);
      }),
      zValidator("json", mergeGuestCartSchema, (result, c) => {
        if (!result.success)
          return c.json({ ok: false as const, code: "VALIDATION_ERROR", message: "Invalid cart" }, 400);
      }),
      async (c) => {
        const pincode = c.req.valid("query").pincode;
        return c.json(ok(await previewCart(ctx, c.req.valid("json").items, pincode)));
      },
    )
    .use("/api/cart/*", requireAuth(ctx))
    .get("/api/cart", async (c) => {
      const user = c.get("user");
      const pincode = c.req.query("pincode");
      return c.json(ok(await getCartDTO(ctx.db, user.id, pincode)));
    })
    .post(
      "/api/cart/items",
      zValidator("json", addCartItemsSchema, (result, c) => {
        if (!result.success)
          return c.json({ ok: false as const, code: "VALIDATION_ERROR", message: "Invalid items" }, 400);
      }),
      async (c) => {
        const user = c.get("user");
        return c.json(ok(await addItems(ctx.db, user.id, c.req.valid("json").items)));
      },
    )
    .patch(
      "/api/cart/items/:variantId",
      zValidator("json", updateCartItemSchema, (result, c) => {
        if (!result.success)
          return c.json({ ok: false as const, code: "VALIDATION_ERROR", message: "Invalid quantity" }, 400);
      }),
      async (c) => {
        const user = c.get("user");
        return c.json(
          ok(await updateItem(ctx.db, user.id, c.req.param("variantId"), c.req.valid("json").quantity)),
        );
      },
    )
    .delete("/api/cart/items/:variantId", async (c) => {
      const user = c.get("user");
      return c.json(ok(await removeItem(ctx.db, user.id, c.req.param("variantId"))));
    })
    .post(
      "/api/cart/coupon",
      zValidator("json", applyCouponSchema, (result, c) => {
        if (!result.success)
          return c.json({ ok: false as const, code: "VALIDATION_ERROR", message: "Invalid coupon" }, 400);
      }),
      async (c) => {
        const user = c.get("user");
        return c.json(ok(await applyCouponToCart(ctx.db, user.id, c.req.valid("json").code)));
      },
    )
    .delete("/api/cart/coupon", async (c) => {
      const user = c.get("user");
      return c.json(ok(await removeCoupon(ctx.db, user.id)));
    })
    .post(
      "/api/cart/merge",
      zValidator("json", mergeGuestCartSchema, (result, c) => {
        if (!result.success)
          return c.json({ ok: false as const, code: "VALIDATION_ERROR", message: "Invalid cart" }, 400);
      }),
      async (c) => {
        const user = c.get("user");
        return c.json(ok(await mergeGuestCart(ctx.db, user.id, c.req.valid("json").items)));
      },
    );
}

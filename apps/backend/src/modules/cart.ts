import { newHono } from "../lib/hono";
import { zValidator } from "@hono/zod-validator";
import {
  addCartItemsSchema,
  applyCouponSchema,
  mergeGuestCartSchema,
  updateCartItemSchema,
} from "@pgrs/contracts";
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

export function cartRoutes(ctx: AppContext) {
  return newHono()
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

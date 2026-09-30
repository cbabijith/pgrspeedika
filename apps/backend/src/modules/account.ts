import { newHono } from "../lib/hono";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, sql } from "drizzle-orm";
import { reviewInputSchema, wishlistToggleSchema } from "@pgrs/contracts";
import { notifications, orderItems, orders, products, reviews, wishlists } from "@pgrs/db";
import type { AppContext } from "../lib/app-context";
import { badRequest, notFound, ok } from "../lib/errors";
import { requireAuth } from "../lib/context";
import { rateLimit } from "../lib/rate-limit";

export function accountRoutes(ctx: AppContext) {
  return (
    newHono()
      .use("/api/reviews/*", requireAuth(ctx))
      .use("/api/wishlist/*", requireAuth(ctx))
      .use("/api/notifications/*", requireAuth(ctx))

      // ── Reviews ─────────────────────────────────────────────────────────────
      .get("/api/reviews", async (c) => {
        const user = c.get("user");
        const rows = await ctx.db
          .select({
            id: reviews.id,
            productId: reviews.productId,
            productName: products.nameEn,
            productSlug: products.slug,
            rating: reviews.rating,
            title: reviews.title,
            body: reviews.body,
            status: reviews.status,
            replyBody: reviews.replyBody,
            createdAt: reviews.createdAt,
          })
          .from(reviews)
          .innerJoin(products, eq(reviews.productId, products.id))
          .where(eq(reviews.userId, user.id))
          .orderBy(desc(reviews.createdAt));
        return c.json(ok(rows));
      })
      .post(
        "/api/reviews",
        zValidator("json", reviewInputSchema, (result, c) => {
          if (!result.success) {
            return c.json(
              {
                ok: false as const,
                code: "VALIDATION_ERROR",
                message: "Invalid review",
                details: result.error.flatten().fieldErrors,
              },
              400,
            );
          }
        }),
        async (c) => {
          const user = c.get("user");
          rateLimit(`review:${user.id}`, { windowMs: 60 * 60 * 1000, max: 10 });
          const input = c.req.valid("json");

          const [product] = await ctx.db
            .select({ id: products.id })
            .from(products)
            .where(eq(products.id, input.productId));
          if (!product) throw notFound("Product not found");

          // Verified-purchase check: a packed/delivered order containing the product.
          const [purchase] = await ctx.db
            .select({ orderId: orders.id })
            .from(orderItems)
            .innerJoin(orders, eq(orderItems.orderId, orders.id))
            .where(
              and(
                eq(orderItems.productId, input.productId),
                eq(orders.userId, user.id),
                sql`${orders.status} in ('delivered', 'out_for_delivery', 'packed')`,
              ),
            )
            .limit(1);

          const existing = await ctx.db
            .select({ id: reviews.id })
            .from(reviews)
            .where(and(eq(reviews.productId, input.productId), eq(reviews.userId, user.id)));
          if (existing.length > 0) throw badRequest("You have already reviewed this product");

          const [row] = await ctx.db
            .insert(reviews)
            .values({
              productId: input.productId,
              userId: user.id,
              orderId: purchase?.orderId ?? null,
              rating: input.rating,
              title: input.title ?? null,
              body: input.body,
              status: "pending",
            })
            .returning();
          return c.json(ok({ ...row, verifiedPurchase: Boolean(purchase) }), 201);
        },
      )

      // ── Wishlist ────────────────────────────────────────────────────────────
      .get("/api/wishlist", async (c) => {
        const user = c.get("user");
        const rows = await ctx.db
          .select({
            productId: wishlists.productId,
            createdAt: wishlists.createdAt,
          })
          .from(wishlists)
          .where(eq(wishlists.userId, user.id));
        return c.json(ok(rows.map((r) => ({ productId: r.productId }))));
      })
      .post(
        "/api/wishlist/toggle",
        zValidator("json", wishlistToggleSchema, (result, c) => {
          if (!result.success)
            return c.json({ ok: false as const, code: "VALIDATION_ERROR", message: "Invalid product" }, 400);
        }),
        async (c) => {
          const user = c.get("user");
          const productId = c.req.valid("json").productId;
          const existing = await ctx.db
            .select({ id: wishlists.id })
            .from(wishlists)
            .where(and(eq(wishlists.userId, user.id), eq(wishlists.productId, productId)));
          if (existing.length > 0) {
            await ctx.db.delete(wishlists).where(eq(wishlists.id, existing[0]!.id));
            return c.json(ok({ wishlisted: false }));
          }
          await ctx.db.insert(wishlists).values({ userId: user.id, productId });
          return c.json(ok({ wishlisted: true }));
        },
      )

      // ── In-app notifications ────────────────────────────────────────────────
      .get("/api/notifications", async (c) => {
        const user = c.get("user");
        const rows = await ctx.db
          .select()
          .from(notifications)
          .where(and(eq(notifications.userId, user.id), eq(notifications.channel, "inapp")))
          .orderBy(desc(notifications.createdAt))
          .limit(50);
        return c.json(
          ok(
            rows.map((n) => ({
              id: n.id,
              title: n.title,
              body: n.body,
              eventName: n.eventName,
              relatedType: n.relatedType,
              relatedId: n.relatedId,
              readAt: n.readAt?.toISOString() ?? null,
              createdAt: n.createdAt.toISOString(),
            })),
          ),
        );
      })
      .post("/api/notifications/:id/read", async (c) => {
        const user = c.get("user");
        await ctx.db
          .update(notifications)
          .set({ readAt: new Date() })
          .where(and(eq(notifications.id, c.req.param("id")), eq(notifications.userId, user.id)));
        return c.json(ok({ read: true }));
      })
      .post("/api/notifications/read-all", async (c) => {
        const user = c.get("user");
        await ctx.db
          .update(notifications)
          .set({ readAt: new Date() })
          .where(and(eq(notifications.userId, user.id), eq(notifications.channel, "inapp")));
        return c.json(ok({ read: true }));
      })
  );
}

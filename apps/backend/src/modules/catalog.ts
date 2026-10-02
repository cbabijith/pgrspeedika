import { newHono } from "../lib/hono";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq } from "drizzle-orm";
import { listProductsQuerySchema, shopSettingsSchema } from "@pgrs/contracts";
import { products, reviews, settings, user } from "@pgrs/db";
import type { AppContext } from "../lib/app-context";
import { notFound, ok } from "../lib/errors";
import {
  getProductDetail,
  homeFeed,
  listCategories,
  listProducts,
  relatedProducts,
} from "../services/catalog";
import { productRatingSummary } from "../services/catalog";

export function catalogRoutes(ctx: AppContext) {
  return (
    newHono()
      .get("/api/shop", async (c) => {
        const [row] = await ctx.db.select().from(settings).where(eq(settings.key, "shop.profile"));
        const parsed = shopSettingsSchema.safeParse(row?.value ?? {});
        if (!parsed.success) return c.json(ok(null));
        const { gstin, ...profile } = parsed.data;
        void gstin;
        return c.json(ok(profile));
      })
      .get("/api/catalog/categories", async (c) => {
        return c.json(ok(await listCategories(ctx.db)));
      })
      .get("/api/catalog/home", async (c) => {
        return c.json(ok(await homeFeed(ctx.db)));
      })
      .get(
        "/api/catalog/products",
        zValidator("query", listProductsQuerySchema, (result, c) => {
          if (!result.success)
            return c.json(
              {
                ok: false as const,
                code: "VALIDATION_ERROR",
                message: "Invalid query",
                details: result.error.flatten().fieldErrors,
              },
              400,
            );
        }),
        async (c) => {
          const query = c.req.valid("query");
          return c.json(ok(await listProducts(ctx.db, query)));
        },
      )
      .get("/api/catalog/products/:slug", async (c) => {
        const slug = c.req.param("slug");
        const product = await getProductDetail(ctx.db, slug);
        if (!product) throw notFound("Product not found");
        const related = await relatedProducts(ctx.db, product.categoryId, product.id);
        const rating = await productRatingSummary(ctx.db, product.id);
        return c.json(ok({ product, related, rating }));
      })
      /** Public: approved reviews (with shop replies) for a product. */
      .get("/api/catalog/products/:slug/reviews", async (c) => {
        const slug = c.req.param("slug");
        const [product] = await ctx.db
          .select({ id: products.id })
          .from(products)
          .where(eq(products.slug, slug));
        if (!product) throw notFound("Product not found");
        const rows = await ctx.db
          .select({
            id: reviews.id,
            rating: reviews.rating,
            title: reviews.title,
            body: reviews.body,
            replyBody: reviews.replyBody,
            createdAt: reviews.createdAt,
            authorName: user.name,
            verified: reviews.orderId,
          })
          .from(reviews)
          .innerJoin(user, eq(reviews.userId, user.id))
          .where(and(eq(reviews.productId, product.id), eq(reviews.status, "approved")))
          .orderBy(desc(reviews.createdAt))
          .limit(50);
        return c.json(
          ok(
            rows.map((r) => ({
              id: r.id,
              rating: r.rating,
              title: r.title,
              body: r.body,
              replyBody: r.replyBody,
              authorName: r.authorName || "Customer",
              verifiedPurchase: r.verified != null,
              createdAt: r.createdAt.toISOString(),
            })),
          ),
        );
      })
  );
}

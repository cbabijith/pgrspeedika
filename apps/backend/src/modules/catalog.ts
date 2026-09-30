import { newHono } from "../lib/hono";
import { zValidator } from "@hono/zod-validator";
import { listProductsQuerySchema } from "@pgrs/contracts";
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
  return newHono()
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
    });
}

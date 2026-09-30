import { newHono } from "../lib/hono";
import { sql } from "drizzle-orm";
import type { AppContext } from "../lib/app-context";
import { ok } from "../lib/errors";

export function healthRoutes(ctx: AppContext) {
  return newHono()
    .get("/health", async (c) => {
      const started = Date.now();
      let dbOk = true;
      try {
        await ctx.db.execute(sql`select 1`);
      } catch {
        dbOk = false;
      }
      return c.json(
        ok({
          status: dbOk ? "ok" : "degraded",
          service: "pgrs-backend",
          db: dbOk ? "up" : "down",
          latencyMs: Date.now() - started,
          time: new Date().toISOString(),
        }),
        dbOk ? 200 : 503,
      );
    })
    .get("/api/docs", (c) => {
      return c.json(
        ok({
          name: "PGRS Peedika API",
          transport: "Hono RPC (typed client via `hc<AppType>`)",
          auth: "/api/auth/* (Better Auth: phone OTP customers, email/password staff)",
          routes: {
            public: [
              "GET /health",
              "GET /api/catalog/categories",
              "GET /api/catalog/products",
              "GET /api/catalog/products/:slug",
              "GET /api/catalog/home",
              "GET /api/search/suggest?q=",
              "GET /api/delivery/zones",
              "POST /api/delivery/check-pincode",
              "GET /api/delivery/slots?date=",
            ],
            customer: [
              "GET /api/cart",
              "POST /api/cart/items",
              "PATCH /api/cart/items/:variantId",
              "DELETE /api/cart/items/:variantId",
              "POST /api/cart/coupon | DELETE /api/cart/coupon",
              "POST /api/cart/merge",
              "GET|POST /api/account/addresses",
              "DELETE /api/account/addresses/:id",
              "POST /api/checkout/order",
              "GET /api/orders",
              "GET /api/orders/:id",
              "POST /api/orders/:id/cancel",
              "GET /api/orders/:id/invoice.pdf",
              "POST /api/orders/:id/reorder",
              "POST /api/payments/:orderId/initiate",
              "POST /api/payments/verify",
              "GET|POST /api/reviews",
              "GET|POST /api/wishlist",
              "GET /api/notifications",
            ],
            admin: [
              "GET /api/admin/dashboard",
              "GET|POST /api/admin/products, PATCH|DELETE /api/admin/products/:id",
              "POST /api/admin/products/:id/duplicate",
              "POST /api/admin/catalog/quick-price",
              "GET|POST /api/admin/categories, PATCH|DELETE /api/admin/categories/:id",
              "GET|POST /api/admin/inventory/adjust",
              "GET /api/admin/inventory/movements",
              "GET /api/admin/orders?board=kanban|table",
              "GET /api/admin/orders/:id",
              "POST /api/admin/orders/:id/pack",
              "POST /api/admin/orders/:id/status",
              "POST /api/admin/orders/:id/assign",
              "POST /api/admin/orders/:id/cod-collect",
              "POST /api/admin/orders/:id/cancel",
              "POST /api/admin/orders/:id/refund",
              "GET /api/admin/orders/:id/invoice.pdf | slip.pdf",
              "GET|POST|PATCH /api/admin/zones[/:id]",
              "GET|POST|PATCH /api/admin/slots[/:id]",
              "GET /api/admin/customers, POST /api/admin/customers/:id/block",
              "GET|POST|PATCH /api/admin/coupons[/:id]",
              "GET|POST|PATCH|DELETE /api/admin/banners[/:id]",
              "GET /api/admin/reviews, POST /api/admin/reviews/:id/moderate",
              "GET /api/admin/reports/:kind(\\.csv)?",
              "GET|POST /api/admin/staff, PATCH /api/admin/staff/:id",
              "GET|PUT /api/admin/settings",
              "GET /api/admin/audit",
            ],
          },
        }),
      );
    });
}

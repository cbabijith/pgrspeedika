import { newHono } from "../lib/hono";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { cancelOrderSchema, paginationQuerySchema } from "@pgrs/contracts";
import { orderItems, orders, productVariants } from "@pgrs/db";
import type { AppContext } from "../lib/app-context";
import { conflict, notFound, ok } from "../lib/errors";
import { requireAuth } from "../lib/context";
import { cancelOrder, getOrderDTO, listOrderSummaries } from "../services/orders";
import { buildInvoicePdf } from "../services/invoice";
import { addItems } from "../services/cart";

export function orderRoutes(ctx: AppContext) {
  return (
    newHono()
      .use("/api/orders/*", requireAuth(ctx))
      .get(
        "/api/orders",
        zValidator("query", paginationQuerySchema, (result, c) => {
          if (!result.success)
            return c.json({ ok: false as const, code: "VALIDATION_ERROR", message: "Invalid page" }, 400);
        }),
        async (c) => {
          const user = c.get("user");
          const { page, pageSize } = c.req.valid("query");
          return c.json(ok(await listOrderSummaries(ctx.db, { userId: user.id, page, pageSize })));
        },
      )
      .get("/api/orders/:id", async (c) => {
        const user = c.get("user");
        const [order] = await ctx.db
          .select({ id: orders.id, userId: orders.userId })
          .from(orders)
          .where(eq(orders.id, c.req.param("id")));
        if (!order) throw notFound("Order not found");
        if (order.userId !== user.id && user.role === "customer") {
          throw notFound("Order not found");
        }
        return c.json(ok(await getOrderDTO(ctx.db, order.id)));
      })
      .post(
        "/api/orders/:id/cancel",
        zValidator("json", cancelOrderSchema, (result, c) => {
          if (!result.success)
            return c.json({ ok: false as const, code: "VALIDATION_ERROR", message: "Reason required" }, 400);
        }),
        async (c) => {
          const user = c.get("user");
          const [order] = await ctx.db
            .select({ id: orders.id, userId: orders.userId, status: orders.status })
            .from(orders)
            .where(eq(orders.id, c.req.param("id")));
          if (!order || (order.userId !== user.id && user.role === "customer")) {
            throw notFound("Order not found");
          }
          const dto = await cancelOrder(ctx, {
            orderId: order.id,
            reason: c.req.valid("json").reason,
            actor: user,
            customerInitiated: order.userId === user.id,
          });
          return c.json(ok(dto));
        },
      )
      .get("/api/orders/:id/invoice.pdf", async (c) => {
        const user = c.get("user");
        const [order] = await ctx.db
          .select({ id: orders.id, userId: orders.userId, status: orders.status })
          .from(orders)
          .where(eq(orders.id, c.req.param("id")));
        if (!order || (order.userId !== user.id && user.role === "customer")) {
          throw notFound("Order not found");
        }
        if (order.status === "pending_payment") {
          throw conflict("Invoice is available after payment");
        }
        const dto = await getOrderDTO(ctx.db, order.id);
        const pdf = await buildInvoicePdf(ctx.db, dto);
        return new Response(new Uint8Array(pdf), {
          headers: {
            "content-type": "application/pdf",
            "content-disposition": `inline; filename="${dto.orderNumber}-invoice.pdf"`,
            "cache-control": "private, no-store",
          },
        });
      })
      /** One-click reorder: put every still-available item back in the cart. */
      .post("/api/orders/:id/reorder", async (c) => {
        const user = c.get("user");
        const [order] = await ctx.db
          .select({ id: orders.id, userId: orders.userId })
          .from(orders)
          .where(eq(orders.id, c.req.param("id")));
        if (!order || (order.userId !== user.id && user.role === "customer")) {
          throw notFound("Order not found");
        }
        const items = await ctx.db
          .select({
            variantId: orderItems.variantId,
            quantity: orderItems.quantity,
            isActive: productVariants.isActive,
            productId: orderItems.productId,
          })
          .from(orderItems)
          .leftJoin(productVariants, eq(orderItems.variantId, productVariants.id))
          .where(eq(orderItems.orderId, order.id));
        const available = items.filter(
          (i): i is { variantId: string; quantity: number; isActive: boolean; productId: string | null } =>
            i.variantId != null && i.isActive === true,
        );
        if (available.length === 0) {
          throw conflict("None of the items from this order are available anymore");
        }
        const cart = await addItems(
          ctx.db,
          user.id,
          available.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
        );
        void cart;
        return c.json(ok({ restored: available.length, missing: items.length - available.length }));
      })
  );
}

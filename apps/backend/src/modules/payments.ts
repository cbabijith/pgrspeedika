import { newHono } from "../lib/hono";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { verifyPaymentSchema } from "@pgrs/contracts";
import { orders, payments } from "@pgrs/db";
import type { AppContext } from "../lib/app-context";
import { badRequest, notFound, ok, paymentFailed } from "../lib/errors";
import { requireAuth } from "../lib/context";
import { capturePayment, ensureProviderOrder, markPaymentFailed } from "../services/orders";
import { verifyPaymentSignature, verifyWebhookSignature } from "../services/payments";

export function paymentRoutes(ctx: AppContext) {
  return (
    newHono()
      /** (Re)create the provider order for a pending payment and hand back
       *  everything the browser checkout needs. */
      .post("/api/payments/:orderId/initiate", requireAuth(ctx), async (c) => {
        const user = c.get("user");
        const [order] = await ctx.db
          .select({ id: orders.id, userId: orders.userId })
          .from(orders)
          .where(eq(orders.id, c.req.param("orderId")));
        if (!order || (order.userId !== user.id && user.role === "customer")) {
          throw notFound("Order not found");
        }
        const payment = await ensureProviderOrder(ctx, order.id);
        return c.json(ok(payment));
      })
      /** Client-side success handler: verify the Razorpay signature and capture. */
      .post(
        "/api/payments/verify",
        requireAuth(ctx),
        zValidator("json", verifyPaymentSchema, (result, c) => {
          if (!result.success)
            return c.json({ ok: false as const, code: "VALIDATION_ERROR", message: "Invalid payload" }, 400);
        }),
        async (c) => {
          const user = c.get("user");
          const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = c.req.valid("json");
          const [payment] = await ctx.db
            .select()
            .from(payments)
            .where(eq(payments.providerOrderId, razorpayOrderId));
          if (!payment) throw notFound("Payment not found");
          const [order] = await ctx.db.select().from(orders).where(eq(orders.id, payment.orderId));
          if (!order || (order.userId !== user.id && user.role === "customer")) {
            throw notFound("Payment not found");
          }
          const valid = verifyPaymentSignature(
            ctx.env,
            razorpayOrderId,
            razorpayPaymentId,
            razorpaySignature,
          );
          if (!valid) {
            await markPaymentFailed(ctx, razorpayOrderId, "Signature verification failed");
            throw paymentFailed("Payment signature verification failed");
          }
          const result = await capturePayment(ctx, {
            providerOrderId: razorpayOrderId,
            providerPaymentId: razorpayPaymentId,
            amountPaise: payment.amountPaise,
            providerPayload: { source: "client-verify" },
          });
          return c.json(ok({ orderId: result.orderId, alreadyCaptured: result.alreadyCaptured }));
        },
      )
      /**
       * Razorpay webhook. The raw body is read before validation so the HMAC is
       * computed over the exact bytes received. Processing is idempotent.
       */
      .post("/api/payments/webhook", async (c) => {
        const raw = await c.req.raw.text();
        const signature = c.req.header("x-razorpay-signature") ?? "";
        if (!verifyWebhookSignature(ctx.env, raw, signature)) {
          return c.json(
            { ok: false as const, code: "UNAUTHORIZED", message: "Invalid webhook signature" },
            401,
          );
        }

        let event: {
          event?: string;
          payload?: {
            payment?: {
              entity?: {
                id?: string;
                order_id?: string;
                amount?: number;
                method?: string;
                status?: string;
                error_description?: string;
              };
            };
          };
        };
        try {
          event = JSON.parse(raw);
        } catch {
          throw badRequest("Webhook body is not JSON");
        }
        const entity = event.payload?.payment?.entity;
        if (!entity?.order_id) {
          return c.json({ ok: true as const, data: { ignored: true } });
        }

        if (event.event === "payment.captured") {
          const result = await capturePayment(ctx, {
            providerOrderId: entity.order_id,
            providerPaymentId: entity.id ?? "",
            amountPaise: entity.amount ?? 0,
            method: entity.method,
            providerPayload: { source: "webhook", event: event.event },
          });
          return c.json(ok({ orderId: result.orderId, replay: result.alreadyCaptured }));
        }
        if (event.event === "payment.failed") {
          await markPaymentFailed(
            ctx,
            entity.order_id,
            entity.error_description ?? "Payment failed at provider",
          );
          return c.json(ok({ marked: "failed" }));
        }
        return c.json(ok({ ignored: true }));
      })
  );
}

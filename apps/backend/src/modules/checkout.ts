import { newHono } from "../lib/hono";
import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { timingSafeEqual } from "node:crypto";
import { addresses, orders, settings } from "@pgrs/db";
import { addressInputSchema, guestOrderSchema, placeOrderSchema, zoneCheckSchema } from "@pgrs/contracts";
import type { AppContext } from "../lib/app-context";
import { conflict, notFound, ok, unauthorized } from "../lib/errors";
import { requireAuth } from "../lib/context";
import { rateLimit, RATE_LIMITS } from "../lib/rate-limit";
import { activeZones } from "../services/catalog";
import { istTodayDateString, slotAvailabilityForDate, isValidDateString } from "../services/slots";
import { ensureProviderOrder, getOrderDTO, placeOrder } from "../services/orders";
import { guestOrderToken, placeWhatsAppOrder } from "../services/whatsapp-orders";
import { getCartDTO } from "../services/cart";

const slotsQuery = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export function checkoutRoutes(ctx: AppContext) {
  return (
    newHono()
      // ── Public: delivery zones + pincode check + slot availability ─────────
      .get("/api/delivery/zones", async (c) => {
        return c.json(ok(await activeZones(ctx.db)));
      })
      .post(
        "/api/delivery/check-pincode",
        zValidator("json", zoneCheckSchema, (result, c) => {
          if (!result.success)
            return c.json({ ok: false as const, code: "VALIDATION_ERROR", message: "Invalid pincode" }, 400);
        }),
        async (c) => {
          const zones = await activeZones(ctx.db);
          const zone = zones.find((z) => z.pincode === c.req.valid("json").pincode);
          return c.json(
            ok({
              served: Boolean(zone),
              zone: zone ?? null,
            }),
          );
        },
      )
      .get(
        "/api/delivery/slots",
        zValidator("query", slotsQuery, (result, c) => {
          if (!result.success)
            return c.json({ ok: false as const, code: "VALIDATION_ERROR", message: "Invalid date" }, 400);
        }),
        async (c) => {
          const date = c.req.valid("query").date ?? istTodayDateString();
          if (!isValidDateString(date))
            return c.json({ ok: false as const, code: "VALIDATION_ERROR", message: "Invalid date" }, 400);
          return c.json(ok(await slotAvailabilityForDate(ctx.db, date)));
        },
      )
      .post(
        "/api/checkout/guest",
        zValidator("json", guestOrderSchema, (result, c) => {
          if (!result.success)
            return c.json(
              {
                ok: false as const,
                code: "VALIDATION_ERROR",
                message: "Complete your order details",
                details: result.error.flatten().fieldErrors,
              },
              400,
            );
        }),
        async (c) => {
          rateLimit(`guest-checkout:${c.get("ip")}`, RATE_LIMITS.checkout);
          const result = await placeWhatsAppOrder(
            {
              db: ctx.db,
              source: "web",
              guestTokenSecret: ctx.env.BETTER_AUTH_SECRET,
              shopWhatsApp: async () => {
                const [row] = await ctx.db.select().from(settings).where(eq(settings.key, "shop.profile"));
                return (row?.value as { whatsapp?: string } | undefined)?.whatsapp ?? "";
              },
            },
            c.req.valid("json"),
          );
          c.header("cache-control", "private, no-store");
          return c.json(ok(result), 201);
        },
      )
      .get(
        "/api/checkout/guest/:id",
        zValidator("query", z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }), (result, c) => {
          if (!result.success)
            return c.json(
              { ok: false as const, code: "UNAUTHORIZED", message: "Private order link required" },
              401,
            );
        }),
        async (c) => {
          if (!z.string().uuid().safeParse(c.req.param("id")).success) throw notFound("Order not found");
          const [order] = await ctx.db
            .select()
            .from(orders)
            .where(eq(orders.id, c.req.param("id")));
          if (!order || order.userId || !order.idempotencyKey) throw notFound("Order not found");
          const expected = guestOrderToken(ctx.env.BETTER_AUTH_SECRET, order.id, order.idempotencyKey);
          if (!timingSafeEqual(Buffer.from(expected), Buffer.from(c.req.valid("query").token)))
            throw unauthorized("Invalid order link");
          c.header("cache-control", "private, no-store");
          return c.json(ok(await getOrderDTO(ctx.db, order.id)));
        },
      )
      // ── Addresses ───────────────────────────────────────────────────────────
      .use("/api/account/*", requireAuth(ctx))
      .get("/api/account/addresses", async (c) => {
        const user = c.get("user");
        const rows = await ctx.db.select().from(addresses).where(eq(addresses.userId, user.id));
        return c.json(ok(rows));
      })
      .post(
        "/api/account/addresses",
        zValidator("json", addressInputSchema, (result, c) => {
          if (!result.success) {
            return c.json(
              {
                ok: false as const,
                code: "VALIDATION_ERROR",
                message: "Invalid address",
                details: result.error.flatten().fieldErrors,
              },
              400,
            );
          }
        }),
        async (c) => {
          const user = c.get("user");
          const input = c.req.valid("json");
          // Address must lie inside a served zone (checkout relies on it).
          const zones = await activeZones(ctx.db);
          if (!zones.some((z) => z.pincode === input.pincode)) {
            return c.json(
              {
                ok: false as const,
                code: "ZONE_NOT_SERVED",
                message: "We do not deliver to this pincode yet",
              },
              422,
            );
          }
          if (input.isDefault) {
            await ctx.db.update(addresses).set({ isDefault: false }).where(eq(addresses.userId, user.id));
          }
          const [row] = await ctx.db
            .insert(addresses)
            .values({
              ...input,
              line2: input.line2 ?? null,
              landmark: input.landmark ?? null,
              userId: user.id,
            })
            .returning();
          return c.json(ok(row), 201);
        },
      )
      .delete("/api/account/addresses/:id", async (c) => {
        const user = c.get("user");
        const deleted = await ctx.db
          .delete(addresses)
          .where(and(eq(addresses.id, c.req.param("id")), eq(addresses.userId, user.id)))
          .returning({ id: addresses.id });
        if (deleted.length === 0) throw notFound("Address not found");
        return c.json(ok({ deleted: deleted[0]?.id }));
      })
      // ── Place order ─────────────────────────────────────────────────────────
      .post(
        "/api/checkout/order",
        requireAuth(ctx),
        zValidator("json", placeOrderSchema, (result, c) => {
          if (!result.success) {
            return c.json(
              {
                ok: false as const,
                code: "VALIDATION_ERROR",
                message: "Invalid order",
                details: result.error.flatten().fieldErrors,
              },
              400,
            );
          }
        }),
        async (c) => {
          const user = c.get("user");
          rateLimit(`checkout:${user.id}`, RATE_LIMITS.checkout);
          const input = c.req.valid("json");

          let result;
          try {
            result = await placeOrder(ctx, {
              userId: user.id,
              addressId: input.addressId,
              address: input.address,
              slotId: input.slotId,
              slotDate: input.slotDate,
              paymentMethod: input.paymentMethod,
              couponCode: input.couponCode ?? null,
              customerNote: input.customerNote ?? null,
              idempotencyKey: input.idempotencyKey,
            });
          } catch (err) {
            // A duplicate idempotency-key insert race resolves to the first order.
            if (err instanceof Error && err.message.includes("orders_idempotency_key_unique")) {
              result = await placeOrder(ctx, {
                userId: user.id,
                addressId: input.addressId,
                address: input.address,
                slotId: input.slotId,
                slotDate: input.slotDate,
                paymentMethod: input.paymentMethod,
                couponCode: input.couponCode ?? null,
                customerNote: input.customerNote ?? null,
                idempotencyKey: input.idempotencyKey,
              });
            } else {
              throw err;
            }
          }

          if (result.status === "pending_payment" && !result.replay) {
            const payment = await ensureProviderOrder(ctx, result.orderId);
            result.payment = {
              paymentId: payment.paymentId,
              providerOrderId: payment.providerOrderId,
              amountPaise: payment.amountPaise,
              keyId: payment.keyId,
              mock: payment.mock,
              mockPay: payment.mockPay,
            };
          } else if (
            result.status === "pending_payment" &&
            result.replay &&
            !result.payment?.providerOrderId
          ) {
            const payment = await ensureProviderOrder(ctx, result.orderId);
            result.payment = {
              paymentId: payment.paymentId,
              providerOrderId: payment.providerOrderId,
              amountPaise: payment.amountPaise,
              keyId: payment.keyId,
              mock: payment.mock,
              mockPay: payment.mockPay,
            };
          }

          return c.json(ok(result), 201);
        },
      )
      // ── Cart totals preview with a zone context (checkout summary) ─────────
      .get("/api/checkout/preview", requireAuth(ctx), async (c) => {
        const user = c.get("user");
        const pincode = c.req.query("pincode");
        if (pincode && !/^[1-9]\d{5}$/.test(pincode)) {
          throw conflict("Invalid pincode");
        }
        return c.json(ok(await getCartDTO(ctx.db, user.id, pincode)));
      })
  );
}

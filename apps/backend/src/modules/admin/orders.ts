import { newHono } from "../../lib/hono";
import { zValidator } from "@hono/zod-validator";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  assignOrderSchema,
  cancelOrderSchema,
  codCollectSchema,
  orderFiltersSchema,
  paginationQuerySchema,
  refundInputSchema,
  weightAdjustmentSchema,
} from "@pgrs/contracts";
import type { OrderStatus } from "@pgrs/db";
import { orders, payments, refunds, user } from "@pgrs/db";
import type { AppContext } from "../../lib/app-context";
import { badRequest, conflict, notFound, ok } from "../../lib/errors";
import { requireStaff } from "../../lib/context";
import { writeAudit } from "../../lib/audit";
import {
  cancelOrder,
  getOrderDTO,
  listOrderSummaries,
  packOrder,
  settleRefund,
  transitionOrder,
} from "../../services/orders";
import { buildOrderPdf } from "../../services/invoice";

const statusValues = [
  "pending_payment",
  "confirmed",
  "packed",
  "out_for_delivery",
  "delivered",
  "cancelled",
] as const;

const boardQuery = orderFiltersSchema.extend(paginationQuerySchema.shape).extend({
  status: z.enum(statusValues).optional(),
  source: z.enum(["web", "whatsapp"]).optional(),
});

const statusTransitionSchema = z.object({
  to: z.enum(statusValues),
  note: z.string().max(300).nullish(),
});

export function adminOrderRoutes(ctx: AppContext) {
  return (
    newHono()
      // ── Board + table ───────────────────────────────────────────────────────
      .get(
        "/orders",
        requireStaff(ctx, "orders:view"),
        zValidator("query", boardQuery, (result, c) => {
          if (!result.success)
            return c.json({ ok: false as const, code: "VALIDATION_ERROR", message: "Invalid filters" }, 400);
        }),
        async (c) => {
          const q = c.req.valid("query");
          const result = await listOrderSummaries(ctx.db, {
            statuses: q.status ? [q.status as OrderStatus] : undefined,
            date: q.date,
            slotId: q.slotId,
            pincode: q.pincode,
            q: q.q,
            source: q.source,
            page: q.page,
            pageSize: q.pageSize,
          });
          return c.json(ok(result));
        },
      )
      .get("/orders/board", requireStaff(ctx, "orders:view"), async (c) => {
        const date = c.req.query("date");
        const statuses: OrderStatus[] = ["confirmed", "packed", "out_for_delivery", "delivered"];
        const result = await listOrderSummaries(ctx.db, {
          statuses,
          date,
          page: 1,
          pageSize: 200,
        });
        const columns: Record<string, typeof result.items> = {
          confirmed: [],
          packed: [],
          out_for_delivery: [],
          delivered: [],
        };
        for (const item of result.items) {
          (columns[item.status] ??= []).push(item);
        }
        return c.json(ok(columns));
      })
      .get("/orders/:id", requireStaff(ctx, "orders:view"), async (c) => {
        return c.json(ok(await getOrderDTO(ctx.db, c.req.param("id"))));
      })

      // ── Packing with weight adjustment ─────────────────────────────────────
      .post(
        "/orders/:id/pack",
        requireStaff(ctx, "orders:pack"),
        zValidator("json", weightAdjustmentSchema, (result, c) => {
          if (!result.success)
            return c.json({ ok: false as const, code: "VALIDATION_ERROR", message: "Invalid weights" }, 400);
        }),
        async (c) => {
          const user = c.get("user");
          const dto = await packOrder(ctx, {
            orderId: c.req.param("id"),
            weights: c.req.valid("json").items,
            actor: user,
          });
          await writeAudit(ctx.db, {
            actor: user,
            action: "order.packed",
            entityType: "order",
            entityId: dto.id,
            before: { grandTotalPaise: dto.grandTotalPaise },
            after: { finalGrandTotalPaise: dto.finalGrandTotalPaise },
          });
          return c.json(ok(dto));
        },
      )

      // ── Status / assignment / cancellation ─────────────────────────────────
      .post(
        "/orders/:id/status",
        requireStaff(ctx, "orders:manage"),
        zValidator("json", statusTransitionSchema, (result, c) => {
          if (!result.success)
            return c.json(
              { ok: false as const, code: "VALIDATION_ERROR", message: "Invalid transition" },
              400,
            );
        }),
        async (c) => {
          const user = c.get("user");
          const to = c.req.valid("json").to;
          if (to === "packed" || to === "cancelled") {
            throw conflict(`Use the dedicated ${to} endpoint for this order`);
          }
          const dto = await transitionOrder(ctx, {
            orderId: c.req.param("id"),
            to: to as OrderStatus,
            note: c.req.valid("json").note ?? null,
            actor: user,
          });
          return c.json(ok(dto));
        },
      )
      .post(
        "/orders/:id/cancel",
        requireStaff(ctx, "orders:manage"),
        zValidator("json", cancelOrderSchema, (result, c) => {
          if (!result.success)
            return c.json({ ok: false as const, code: "VALIDATION_ERROR", message: "Reason required" }, 400);
        }),
        async (c) => {
          const user = c.get("user");
          const dto = await cancelOrder(ctx, {
            orderId: c.req.param("id"),
            reason: c.req.valid("json").reason,
            actor: user,
            customerInitiated: false,
          });
          await writeAudit(ctx.db, {
            actor: user,
            action: "order.cancelled",
            entityType: "order",
            entityId: dto.id,
            after: { reason: c.req.valid("json").reason, refunded: dto.refundIssuedPaise },
          });
          return c.json(ok(dto));
        },
      )
      .post(
        "/orders/:id/assign",
        requireStaff(ctx, "delivery:manage"),
        zValidator("json", assignOrderSchema, (result, c) => {
          if (!result.success)
            return c.json(
              { ok: false as const, code: "VALIDATION_ERROR", message: "Invalid assignment" },
              400,
            );
        }),
        async (c) => {
          const id = c.req.param("id");
          const { userId: assigneeId } = c.req.valid("json");
          const actor = c.get("user");
          const [order] = await ctx.db.select().from(orders).where(eq(orders.id, id));
          if (!order) throw notFound("Order not found");
          if (assigneeId) {
            const [staff] = await ctx.db
              .select({ id: user.id, role: user.role })
              .from(user)
              .where(eq(user.id, assigneeId));
            if (!staff || staff.role === "customer") throw badRequest("Assignee must be a staff member");
          }
          await ctx.db
            .update(orders)
            .set({ assignedTo: assigneeId, updatedAt: new Date() })
            .where(eq(orders.id, id));
          await writeAudit(ctx.db, {
            actor,
            action: "order.assigned",
            entityType: "order",
            entityId: id,
            after: { assignedTo: assigneeId },
          });
          return c.json(ok({ assignedTo: assigneeId }));
        },
      )
      .post(
        "/orders/:id/cod-collect",
        requireStaff(ctx, "delivery:manage"),
        zValidator("json", codCollectSchema, (result, c) => {
          if (!result.success)
            return c.json({ ok: false as const, code: "VALIDATION_ERROR", message: "Invalid amount" }, 400);
        }),
        async (c) => {
          const id = c.req.param("id");
          const user = c.get("user");
          const { amountPaise } = c.req.valid("json");
          const [order] = await ctx.db.select().from(orders).where(eq(orders.id, id));
          if (!order) throw notFound("Order not found");
          if (order.paymentMethod !== "cod") throw conflict("Not a COD order");
          if (order.status !== "delivered" && order.status !== "out_for_delivery") {
            throw conflict("Record cash after the order goes out for delivery");
          }
          const expected = order.finalGrandTotalPaise ?? order.grandTotalPaise;
          if (amountPaise !== expected) {
            throw conflict(`Collected amount must be exactly the final total (${expected} paise)`);
          }
          await ctx.db
            .update(orders)
            .set({ codCollectedPaise: amountPaise, paymentStatus: "paid", updatedAt: new Date() })
            .where(eq(orders.id, id));
          await writeAudit(ctx.db, {
            actor: user,
            action: "order.cod_collected",
            entityType: "order",
            entityId: id,
            after: { amountPaise },
          });
          return c.json(ok({ collected: amountPaise }));
        },
      )

      // ── Refunds ─────────────────────────────────────────────────────────────
      .post(
        "/orders/:id/refund",
        requireStaff(ctx, "refunds:manage"),
        zValidator("json", refundInputSchema, (result, c) => {
          if (!result.success)
            return c.json({ ok: false as const, code: "VALIDATION_ERROR", message: "Invalid refund" }, 400);
        }),
        async (c) => {
          const id = c.req.param("id");
          const user = c.get("user");
          const input = c.req.valid("json");
          const [order] = await ctx.db.select().from(orders).where(eq(orders.id, id));
          if (!order) throw notFound("Order not found");
          if (order.paymentStatus !== "paid" && order.paymentStatus !== "partially_refunded") {
            throw conflict("Only paid orders can be refunded");
          }
          const paid = order.grandTotalPaise;
          if (order.refundIssuedPaise + input.amountPaise > paid) {
            throw conflict("Refund exceeds the amount paid");
          }
          const [paymentRow] = await ctx.db
            .select({ id: payments.id, providerPaymentId: payments.providerPaymentId })
            .from(payments)
            .where(and(eq(payments.orderId, id), eq(payments.status, "captured")))
            .limit(1);
          const [refund] = await ctx.db
            .insert(refunds)
            .values({
              orderId: id,
              paymentId: paymentRow?.id ?? null,
              amountPaise: input.amountPaise,
              reason: input.reason,
              status: "pending",
              initiatedBy: user.id,
            })
            .returning();
          if (!refund) throw new Error("Refund insert failed");
          await settleRefund(ctx, refund.id);
          await writeAudit(ctx.db, {
            actor: user,
            action: "refund.issued",
            entityType: "order",
            entityId: id,
            after: { amountPaise: input.amountPaise, reason: input.reason },
          });
          return c.json(ok(await getOrderDTO(ctx.db, id)));
        },
      )

      // ── Delivery route list grouped by pincode and slot ────────────────────
      .get("/delivery/routes", requireStaff(ctx, "delivery:manage"), async (c) => {
        const date = c.req.query("date");
        const rows = await ctx.db
          .select({
            id: orders.id,
            orderNumber: orders.orderNumber,
            status: orders.status,
            pincode: orders.pincode,
            areaName: orders.address,
            slotLabel: orders.slotLabelEn,
            slotDate: orders.slotDate,
            grandTotalPaise: orders.grandTotalPaise,
            finalGrandTotalPaise: orders.finalGrandTotalPaise,
            paymentMethod: orders.paymentMethod,
            paymentStatus: orders.paymentStatus,
            assignedTo: orders.assignedTo,
            assignedToName: user.name,
          })
          .from(orders)
          .leftJoin(user, eq(orders.assignedTo, user.id))
          .where(
            date
              ? and(eq(orders.slotDate, date), inArray(orders.status, ["packed", "out_for_delivery"]))
              : inArray(orders.status, ["packed", "out_for_delivery"]),
          );
        const grouped = new Map<string, Array<(typeof rows)[number]>>();
        for (const row of rows) {
          const area = `${row.areaName.areaName} (${row.pincode})`;
          const list = grouped.get(area) ?? [];
          list.push(row);
          grouped.set(area, list);
        }
        return c.json(ok({ date: date ?? null, groups: [...grouped.entries()] }));
      })

      // ── PDF documents ───────────────────────────────────────────────────────
      .get("/orders/:id/invoice.pdf", requireStaff(ctx, "orders:view"), async (c) => {
        const dto = await getOrderDTO(ctx.db, c.req.param("id"));
        const pdf = await buildOrderPdf(ctx.db, dto, "invoice");
        return new Response(new Uint8Array(pdf), {
          headers: {
            "content-type": "application/pdf",
            "content-disposition": `inline; filename="${dto.orderNumber}-invoice.pdf"`,
          },
        });
      })
      .get("/orders/:id/slip.pdf", requireStaff(ctx, "orders:pack"), async (c) => {
        const dto = await getOrderDTO(ctx.db, c.req.param("id"));
        const pdf = await buildOrderPdf(ctx.db, dto, "slip");
        return new Response(new Uint8Array(pdf), {
          headers: {
            "content-type": "application/pdf",
            "content-disposition": `inline; filename="${dto.orderNumber}-slip.pdf"`,
          },
        });
      })
  );
}

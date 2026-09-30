import { newHono } from "../../lib/hono";
import { zValidator } from "@hono/zod-validator";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { deliverySlots, inventory, orderItems, orders, products, slotBookings, user } from "@pgrs/db";
import type { AppContext } from "../../lib/app-context";
import { ok } from "../../lib/errors";
import { requireStaff } from "../../lib/context";
import { istTodayDateString } from "../../services/slots";

const paise = (col: unknown) => sql<number>`coalesce(sum(${col}), 0)::int`;

export function adminReportRoutes(ctx: AppContext) {
  return (
    newHono()
      /** Dashboard: today at a glance for the owner. */
      .get("/dashboard", requireStaff(ctx, "orders:view"), async (c) => {
        const today = istTodayDateString();

        const [byStatus] = await ctx.db
          .select({
            confirmed: sql<number>`count(*) filter (where status = 'confirmed')::int`,
            packed: sql<number>`count(*) filter (where status = 'packed')::int`,
            outForDelivery: sql<number>`count(*) filter (where status = 'out_for_delivery')::int`,
            delivered: sql<number>`count(*) filter (where status = 'delivered')::int`,
            cancelled: sql<number>`count(*) filter (where status = 'cancelled')::int`,
            pendingPayment: sql<number>`count(*) filter (where status = 'pending_payment')::int`,
          })
          .from(orders)
          .where(sql`${orders.slotDate} = ${today}`);

        const [revenue] = await ctx.db
          .select({
            todayRevenuePaise: sql<number>`coalesce(sum(coalesce(${orders.finalGrandTotalPaise}, ${orders.grandTotalPaise})) filter (where ${orders.status} = 'delivered' and ${orders.slotDate} = ${today}), 0)::int`,
            monthRevenuePaise: sql<number>`coalesce(sum(coalesce(${orders.finalGrandTotalPaise}, ${orders.grandTotalPaise})) filter (where ${orders.status} = 'delivered' and ${orders.placedAt} > now() - interval '30 days'), 0)::int`,
          })
          .from(orders);

        const [newCustomers] = await ctx.db
          .select({ count: sql<number>`count(*)::int` })
          .from(user)
          .where(sql`${user.role} = 'customer' and ${user.createdAt} > now() - interval '24 hours'`);

        const lowStock = await ctx.db
          .select({
            productId: products.id,
            nameEn: products.nameEn,
            sellingType: products.sellingType,
            available: sql<number>`greatest(${inventory.stockQuantity} - ${inventory.reservedQuantity}, 0)`,
            lowStockThreshold: inventory.lowStockThreshold,
          })
          .from(products)
          .innerJoin(inventory, eq(inventory.productId, products.id))
          .where(
            and(
              eq(products.isActive, true),
              eq(inventory.trackStock, true),
              sql`${inventory.stockQuantity} - ${inventory.reservedQuantity} <= ${inventory.lowStockThreshold}`,
            ),
          )
          .limit(20);

        const slotUtilization = await ctx.db
          .select({
            slotId: deliverySlots.id,
            name: deliverySlots.nameEn,
            capacity: deliverySlots.capacity,
            booked: sql<number>`coalesce((select ${slotBookings.bookedCount} from ${slotBookings} where ${slotBookings.slotId} = ${deliverySlots.id} and ${slotBookings.bookingDate} = ${today}), 0)`,
          })
          .from(deliverySlots)
          .where(eq(deliverySlots.isActive, true));

        // slot_date is stored as a YYYY-MM-DD string; compare/group directly.
        const salesTrend = await ctx.db
          .select({
            date: sql<string>`${orders.slotDate}`,
            revenuePaise: paise(sql`coalesce(${orders.finalGrandTotalPaise}, ${orders.grandTotalPaise})`),
            orderCount: sql<number>`count(*)::int`,
          })
          .from(orders)
          .where(
            and(
              sql`${orders.slotDate} >= to_char(now() - interval '13 days', 'YYYY-MM-DD')`,
              sql`${orders.status} in ('delivered', 'out_for_delivery', 'packed', 'confirmed')`,
            ),
          )
          .groupBy(orders.slotDate)
          .orderBy(orders.slotDate);

        return c.json(
          ok({
            date: today,
            ordersByStatus: byStatus ?? {},
            revenue,
            newCustomers: newCustomers?.count ?? 0,
            lowStock,
            slotUtilization,
            salesTrend,
          }),
        );
      })

      /** Reports: sales by day / product / category, GST summary, payment split,
       *  top customers. `?format=csv` streams a CSV export. */
      .get(
        "/reports/:kind",
        requireStaff(ctx, "reports:view"),
        zValidator(
          "query",
          z.object({
            from: z
              .string()
              .regex(/^\d{4}-\d{2}-\d{2}$/)
              .optional(),
            to: z
              .string()
              .regex(/^\d{4}-\d{2}-\d{2}$/)
              .optional(),
            format: z.enum(["csv", "json"]).optional(),
          }),
          (result, c) => {
            if (!result.success)
              return c.json({ ok: false as const, code: "VALIDATION_ERROR", message: "Invalid range" }, 400);
          },
        ),
        async (c) => {
          const kind = c.req.param("kind");
          const query = c.req.valid("query");
          const from = query.from ?? new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
          const to = query.to ?? new Date().toISOString().slice(0, 10);
          const asCsv = query.format === "csv";
          const fromTs = new Date(`${from}T00:00:00+05:30`);
          const toTs = new Date(`${to}T23:59:59+05:30`);

          let rows: Array<Record<string, string | number>> = [];
          if (kind === "sales-by-day") {
            const data = await ctx.db
              .select({
                date: sql<string>`to_char(${orders.placedAt}, 'YYYY-MM-DD')`,
                orders: sql<number>`count(*)::int`,
                revenuePaise: sql<number>`coalesce(sum(coalesce(${orders.finalGrandTotalPaise}, ${orders.grandTotalPaise})) filter (where ${orders.status} <> 'cancelled'), 0)::int`,
                deliveredPaise: sql<number>`coalesce(sum(coalesce(${orders.finalGrandTotalPaise}, ${orders.grandTotalPaise})) filter (where ${orders.status} = 'delivered'), 0)::int`,
              })
              .from(orders)
              .where(and(sql`${orders.placedAt} >= ${fromTs}`, sql`${orders.placedAt} <= ${toTs}`))
              .groupBy(sql`to_char(${orders.placedAt}, 'YYYY-MM-DD')`)
              .orderBy(sql`to_char(${orders.placedAt}, 'YYYY-MM-DD')`);
            rows = data;
          } else if (kind === "sales-by-product") {
            const data = await ctx.db
              .select({
                product: orderItems.nameEn,
                quantitySold: sql<number>`sum(${orderItems.quantity})::int`,
                revenuePaise: sql<number>`coalesce(sum(coalesce(${orderItems.finalLineTotalPaise}, ${orderItems.lineTotalPaise})), 0)::int`,
              })
              .from(orderItems)
              .innerJoin(orders, eq(orderItems.orderId, orders.id))
              .where(
                and(
                  sql`${orders.placedAt} >= ${fromTs}`,
                  sql`${orders.placedAt} <= ${toTs}`,
                  sql`${orders.status} <> 'cancelled'`,
                ),
              )
              .groupBy(orderItems.nameEn)
              .orderBy(sql`2 desc`);
            rows = data;
          } else if (kind === "sales-by-category") {
            const data = await ctx.db
              .select({
                category: sql<string>`c.name_en`,
                revenuePaise: sql<number>`coalesce(sum(coalesce(${orderItems.finalLineTotalPaise}, ${orderItems.lineTotalPaise})), 0)::int`,
              })
              .from(orderItems)
              .innerJoin(orders, eq(orderItems.orderId, orders.id))
              .innerJoin(products, eq(orderItems.productId, products.id))
              .innerJoin(sql`categories c`, sql`c.id = ${products.categoryId}`)
              .where(and(sql`${orders.placedAt} >= ${fromTs}`, sql`${orders.status} <> 'cancelled'`))
              .groupBy(sql`c.name_en`)
              .orderBy(sql`2 desc`);
            rows = data;
          } else if (kind === "gst-summary") {
            const data = await ctx.db
              .select({
                gstRate: orderItems.gstRate,
                taxableValuePaise: sql<number>`coalesce(sum(coalesce(${orderItems.finalLineTotalPaise}, ${orderItems.lineTotalPaise})) filter (where ${orders.status} <> 'cancelled'), 0)::int`,
              })
              .from(orderItems)
              .innerJoin(orders, eq(orderItems.orderId, orders.id))
              .where(and(sql`${orders.placedAt} >= ${fromTs}`, sql`${orders.placedAt} <= ${toTs}`))
              .groupBy(orderItems.gstRate)
              .orderBy(orderItems.gstRate);
            rows = data.map((r) => ({
              gstRate: r.gstRate,
              taxableValuePaise: r.taxableValuePaise,
              taxPaise: Math.round((r.taxableValuePaise * r.gstRate) / (100 + r.gstRate)),
            }));
          } else if (kind === "payment-split") {
            const data = await ctx.db
              .select({
                paymentMethod: orders.paymentMethod,
                paymentStatus: orders.paymentStatus,
                orders: sql<number>`count(*)::int`,
                revenuePaise: sql<number>`coalesce(sum(coalesce(${orders.finalGrandTotalPaise}, ${orders.grandTotalPaise})), 0)::int`,
              })
              .from(orders)
              .where(and(sql`${orders.placedAt} >= ${fromTs}`, sql`${orders.placedAt} <= ${toTs}`))
              .groupBy(orders.paymentMethod, orders.paymentStatus);
            rows = data;
          } else if (kind === "top-customers") {
            const data = await ctx.db
              .select({
                customer: sql<string>`coalesce(u.name, 'Guest')`,
                phone: sql<string>`coalesce(u.phone_number, '')`,
                orders: sql<number>`count(*)::int`,
                spentPaise: sql<number>`coalesce(sum(coalesce(${orders.finalGrandTotalPaise}, ${orders.grandTotalPaise})), 0)::int`,
              })
              .from(orders)
              .leftJoin(sql`"user" u`, sql`u.id = ${orders.userId}`)
              .where(and(sql`${orders.placedAt} >= ${fromTs}`, sql`${orders.status} = 'delivered'`))
              .groupBy(sql`u.name, u.phone_number`)
              .orderBy(sql`4 desc`)
              .limit(50);
            rows = data;
          } else {
            return c.json(
              { ok: false as const, code: "NOT_FOUND", message: `Unknown report "${kind}"` },
              404,
            );
          }

          if (asCsv) {
            const headers = rows.length > 0 ? Object.keys(rows[0]!) : ["empty"];
            const escape = (value: unknown): string => {
              const s = value == null ? "" : String(value);
              return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
            };
            const csv = [
              headers.join(","),
              ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
            ].join("\n");
            return new Response(csv, {
              headers: {
                "content-type": "text/csv; charset=utf-8",
                "content-disposition": `attachment; filename="pgrs-${kind}-${from}-to-${to}.csv"`,
              },
            });
          }
          return c.json(ok({ kind, from, to, rows }));
        },
      )
  );
}

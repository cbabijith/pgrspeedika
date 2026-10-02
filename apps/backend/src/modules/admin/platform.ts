import { newHono } from "../../lib/hono";
import { zValidator } from "@hono/zod-validator";
import { asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  shopSettingsSchema,
  slotInputSchema,
  staffInviteSchema,
  staffUpdateSchema,
  zoneInputSchema,
  isKottayamPincode,
} from "@pgrs/contracts";
import {
  addresses,
  auditLogs,
  deliverySlots,
  deliveryZones,
  orders,
  settings,
  slotBookings,
  user,
} from "@pgrs/db";
import type { AppContext } from "../../lib/app-context";
import { badRequest, conflict, notFound, ok } from "../../lib/errors";
import { requireStaff } from "../../lib/context";
import { writeAudit } from "../../lib/audit";
import { getHolidayDates, saveHolidayDates } from "../../services/slots";
import { createStaffUser } from "../../services/staff";

export function adminPlatformRoutes(ctx: AppContext) {
  return (
    newHono()
      // ── Delivery zones ──────────────────────────────────────────────────────
      .get("/zones", requireStaff(ctx, "delivery:manage"), async (c) => {
        const rows = await ctx.db.select().from(deliveryZones).orderBy(asc(deliveryZones.pincode));
        return c.json(ok(rows));
      })
      .post(
        "/zones",
        requireStaff(ctx, "delivery:manage"),
        zValidator("json", zoneInputSchema, (result, c) => {
          if (!result.success)
            return c.json(
              {
                ok: false as const,
                code: "VALIDATION_ERROR",
                message: "Invalid zone",
                details: result.error.flatten().fieldErrors,
              },
              400,
            );
        }),
        async (c) => {
          const input = c.req.valid("json");
          const existing = await ctx.db
            .select({ id: deliveryZones.id })
            .from(deliveryZones)
            .where(eq(deliveryZones.pincode, input.pincode));
          if (existing.length > 0) throw conflict("This pincode already has a zone");
          const [row] = await ctx.db
            .insert(deliveryZones)
            .values({ ...input, freeDeliveryThresholdPaise: input.freeDeliveryThresholdPaise ?? null })
            .returning();
          return c.json(ok(row), 201);
        },
      )
      .patch(
        "/zones/:id",
        requireStaff(ctx, "delivery:manage"),
        zValidator("json", zoneInputSchema.partial(), (result, c) => {
          if (!result.success)
            return c.json({ ok: false as const, code: "VALIDATION_ERROR", message: "Invalid zone" }, 400);
        }),
        async (c) => {
          const input = c.req.valid("json");
          if (input.isActive === true) {
            const [existing] = await ctx.db
              .select({ pincode: deliveryZones.pincode })
              .from(deliveryZones)
              .where(eq(deliveryZones.id, c.req.param("id")));
            if (!existing) throw notFound("Zone not found");
            if (!isKottayamPincode(input.pincode ?? existing.pincode)) {
              throw badRequest("Delivery is currently limited to Kottayam district");
            }
          }
          const [row] = await ctx.db
            .update(deliveryZones)
            .set({ ...input, updatedAt: new Date() })
            .where(eq(deliveryZones.id, c.req.param("id")))
            .returning();
          if (!row) throw notFound("Zone not found");
          return c.json(ok(row));
        },
      )

      // ── Delivery slots ──────────────────────────────────────────────────────
      .get("/slots", requireStaff(ctx, "delivery:manage"), async (c) => {
        const slots = await ctx.db.select().from(deliverySlots).orderBy(asc(deliverySlots.sortOrder));
        const bookings = await ctx.db
          .select({
            slotId: slotBookings.slotId,
            date: slotBookings.bookingDate,
            bookedCount: slotBookings.bookedCount,
          })
          .from(slotBookings);
        return c.json(ok({ slots, bookings }));
      })
      .post(
        "/slots",
        requireStaff(ctx, "delivery:manage"),
        zValidator("json", slotInputSchema, (result, c) => {
          if (!result.success)
            return c.json(
              {
                ok: false as const,
                code: "VALIDATION_ERROR",
                message: "Invalid slot",
                details: result.error.flatten().fieldErrors,
              },
              400,
            );
        }),
        async (c) => {
          const input = c.req.valid("json");
          if (input.endMinutes <= input.startMinutes) throw badRequest("Slot end must be after start");
          const [row] = await ctx.db.insert(deliverySlots).values(input).returning();
          return c.json(ok(row), 201);
        },
      )
      .patch(
        "/slots/:id",
        requireStaff(ctx, "delivery:manage"),
        zValidator("json", slotInputSchema.partial(), (result, c) => {
          if (!result.success)
            return c.json({ ok: false as const, code: "VALIDATION_ERROR", message: "Invalid slot" }, 400);
        }),
        async (c) => {
          const [row] = await ctx.db
            .update(deliverySlots)
            .set({ ...c.req.valid("json"), updatedAt: new Date() })
            .where(eq(deliverySlots.id, c.req.param("id")))
            .returning();
          if (!row) throw notFound("Slot not found");
          return c.json(ok(row));
        },
      )

      // ── Holiday / closed days ──────────────────────────────────────────────
      .get("/holidays", requireStaff(ctx, "delivery:manage"), async (c) => {
        return c.json(ok({ dates: await getHolidayDates(ctx.db) }));
      })
      .put(
        "/holidays",
        requireStaff(ctx, "delivery:manage"),
        zValidator(
          "json",
          z.object({ dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(200) }),
          (result, c) => {
            if (!result.success)
              return c.json({ ok: false as const, code: "VALIDATION_ERROR", message: "Invalid dates" }, 400);
          },
        ),
        async (c) => {
          const actor = c.get("user");
          const before = await getHolidayDates(ctx.db);
          const dates = await saveHolidayDates(ctx.db, c.req.valid("json").dates);
          await writeAudit(ctx.db, {
            actor,
            action: "delivery.holidays_updated",
            entityType: "settings",
            entityId: "delivery.holidays",
            before: { dates: before },
            after: { dates },
          });
          return c.json(ok({ dates }));
        },
      )

      // ── Customers ───────────────────────────────────────────────────────────
      .get("/customers", requireStaff(ctx, "customers:view"), async (c) => {
        const q = (c.req.query("q") ?? "").toLowerCase();
        const rows = await ctx.db
          .select({
            id: user.id,
            name: user.name,
            phoneNumber: user.phoneNumber,
            email: user.email,
            banned: user.banned,
            createdAt: user.createdAt,
            orderCount: sql<number>`(select count(*)::int from orders o where o.user_id = ${user.id} and o.status <> 'cancelled')`,
            totalSpentPaise: sql<number>`(
            select coalesce(sum(coalesce(o.final_grand_total_paise, o.grand_total_paise)), 0)::int
            from orders o where o.user_id = ${user.id} and o.status = 'delivered'
          )`,
          })
          .from(user)
          .where(
            sql`${user.role} = 'customer' and (${q} = '' or lower(${user.name}) like ${`%${q}%`} or ${user.phoneNumber} like ${`%${q}%`})`,
          )
          .orderBy(desc(user.createdAt))
          .limit(200);
        return c.json(ok(rows));
      })
      .get("/customers/:id/orders", requireStaff(ctx, "customers:view"), async (c) => {
        const rows = await ctx.db
          .select({
            id: orders.id,
            orderNumber: orders.orderNumber,
            status: orders.status,
            grandTotalPaise: orders.grandTotalPaise,
            finalGrandTotalPaise: orders.finalGrandTotalPaise,
            placedAt: orders.placedAt,
          })
          .from(orders)
          .where(eq(orders.userId, c.req.param("id")))
          .orderBy(desc(orders.placedAt));
        return c.json(ok(rows));
      })
      .post(
        "/customers/:id/block",
        requireStaff(ctx, "customers:manage"),
        zValidator("json", z.object({ banned: z.boolean().optional() }), (result, c) => {
          if (!result.success)
            return c.json({ ok: false as const, code: "VALIDATION_ERROR", message: "Invalid body" }, 400);
        }),
        async (c) => {
          const id = c.req.param("id");
          const staff = c.get("user");
          const body = c.req.valid("json") as { banned?: boolean };
          const banned = Boolean((body as { banned?: boolean }).banned ?? true);
          const [row] = await ctx.db
            .update(user)
            .set({ banned, banReason: banned ? "Blocked by shop" : null, updatedAt: new Date() })
            .where(eq(user.id, id))
            .returning({ id: user.id, banned: user.banned });
          if (!row) throw notFound("Customer not found");
          await writeAudit(ctx.db, {
            actor: staff,
            action: banned ? "customer.blocked" : "customer.unblocked",
            entityType: "user",
            entityId: id,
          });
          return c.json(ok(row));
        },
      )
      .get("/staff", requireStaff(ctx, "staff:manage"), async (c) => {
        const rows = await ctx.db
          .select({
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            banned: user.banned,
            createdAt: user.createdAt,
          })
          .from(user)
          .where(sql`${user.role} <> 'customer'`)
          .orderBy(asc(user.name));
        return c.json(ok(rows));
      })
      .post(
        "/staff",
        requireStaff(ctx, "staff:manage"),
        zValidator("json", staffInviteSchema, (result, c) => {
          if (!result.success)
            return c.json(
              {
                ok: false as const,
                code: "VALIDATION_ERROR",
                message: "Invalid staff member",
                details: result.error.flatten().fieldErrors,
              },
              400,
            );
        }),
        async (c) => {
          const input = c.req.valid("json");
          const staff = c.get("user");
          const userId = await createStaffUser(ctx.db, {
            name: input.name,
            email: input.email,
            password: input.password,
            role: input.role,
          });
          await writeAudit(ctx.db, {
            actor: staff,
            action: "staff.invited",
            entityType: "user",
            entityId: userId,
            after: { email: input.email, role: input.role },
          });
          return c.json(ok({ id: userId }), 201);
        },
      )
      .patch(
        "/staff/:id",
        requireStaff(ctx, "staff:manage"),
        zValidator("json", staffUpdateSchema, (result, c) => {
          if (!result.success)
            return c.json({ ok: false as const, code: "VALIDATION_ERROR", message: "Invalid update" }, 400);
        }),
        async (c) => {
          const id = c.req.param("id");
          const staff = c.get("user");
          if (id === staff.id && c.req.valid("json").banned === true) {
            throw badRequest("You cannot block your own account");
          }
          const [row] = await ctx.db
            .update(user)
            .set({ ...c.req.valid("json"), updatedAt: new Date() })
            .where(eq(user.id, id))
            .returning({ id: user.id, role: user.role, banned: user.banned });
          if (!row) throw notFound("Staff member not found");
          await writeAudit(ctx.db, {
            actor: staff,
            action: "staff.updated",
            entityType: "user",
            entityId: id,
            after: c.req.valid("json") as Record<string, unknown>,
          });
          return c.json(ok(row));
        },
      )
      .delete("/staff/:id", requireStaff(ctx, "staff:manage"), async (c) => {
        const id = c.req.param("id");
        const staff = c.get("user");
        if (id === staff.id) throw badRequest("You cannot delete your own account");
        const [row] = await ctx.db
          .select({ id: user.id, role: user.role, email: user.email })
          .from(user)
          .where(eq(user.id, id));
        if (!row) throw notFound("Staff member not found");
        if (row.role === "customer") throw badRequest("Use the customers section for customers");
        // Cascades to sessions/accounts; orders keep their snapshots.
        await ctx.db.delete(user).where(eq(user.id, id));
        await writeAudit(ctx.db, {
          actor: staff,
          action: "staff.deleted",
          entityType: "user",
          entityId: id,
          after: { email: row.email, role: row.role },
        });
        return c.json(ok({ deleted: id }));
      })

      // ── Settings ────────────────────────────────────────────────────────────
      .get("/settings", requireStaff(ctx, "settings:manage"), async (c) => {
        const [row] = await ctx.db.select().from(settings).where(eq(settings.key, "shop.profile"));
        const parsed = shopSettingsSchema.safeParse(row?.value ?? {});
        return c.json(ok(parsed.success ? parsed.data : {}));
      })
      .put(
        "/settings",
        requireStaff(ctx, "settings:manage"),
        zValidator("json", shopSettingsSchema, (result, c) => {
          if (!result.success)
            return c.json(
              {
                ok: false as const,
                code: "VALIDATION_ERROR",
                message: "Invalid settings",
                details: result.error.flatten().fieldErrors,
              },
              400,
            );
        }),
        async (c) => {
          const input = c.req.valid("json");
          const staff = c.get("user");
          await ctx.db
            .insert(settings)
            .values({ key: "shop.profile", value: input as unknown as Record<string, unknown> })
            .onConflictDoUpdate({
              target: settings.key,
              set: { value: input as unknown as Record<string, unknown>, updatedAt: new Date() },
            });
          await writeAudit(ctx.db, {
            actor: staff,
            action: "settings.updated",
            entityType: "settings",
            entityId: "shop.profile",
            after: input as unknown as Record<string, unknown>,
          });
          return c.json(ok(input));
        },
      )
      .get("/settings/public", async (c) => {
        const [row] = await ctx.db.select().from(settings).where(eq(settings.key, "shop.profile"));
        const parsed = shopSettingsSchema.safeParse(row?.value ?? {});
        if (!parsed.success) return c.json(ok(null));
        const { gstin, ...publicPart } = parsed.data;
        void gstin;
        return c.json(ok(publicPart));
      })

      // ── Audit log ───────────────────────────────────────────────────────────
      .get("/audit", requireStaff(ctx, "audit:view"), async (c) => {
        const rows = await ctx.db
          .select({
            id: auditLogs.id,
            actorId: auditLogs.actorId,
            actorRole: auditLogs.actorRole,
            action: auditLogs.action,
            entityType: auditLogs.entityType,
            entityId: auditLogs.entityId,
            before: auditLogs.before,
            after: auditLogs.after,
            createdAt: auditLogs.createdAt,
          })
          .from(auditLogs)
          .orderBy(desc(auditLogs.createdAt))
          .limit(200);
        return c.json(ok(rows));
      })
      // Address sanity listing used by the customers detail page.
      .get("/customers/:id/addresses", requireStaff(ctx, "customers:view"), async (c) => {
        const rows = await ctx.db
          .select()
          .from(addresses)
          .where(eq(addresses.userId, c.req.param("id")));
        return c.json(ok(rows));
      })
  );
}

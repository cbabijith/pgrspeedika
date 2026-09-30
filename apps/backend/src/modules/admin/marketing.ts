import { newHono } from "../../lib/hono";
import { zValidator } from "@hono/zod-validator";
import { asc, desc, eq, sql } from "drizzle-orm";
import { bannerInputSchema, couponInputSchema, reviewReplySchema } from "@pgrs/contracts";
import { z } from "zod";
import { banners, coupons, products, reviews, user } from "@pgrs/db";
import type { AppContext } from "../../lib/app-context";
import { conflict, notFound, ok } from "../../lib/errors";
import { requireStaff } from "../../lib/context";
import { writeAudit } from "../../lib/audit";

const moderateSchema = z.object({ status: z.enum(["approved", "hidden", "pending"]) });

export function adminMarketingRoutes(ctx: AppContext) {
  return (
    newHono()
      // ── Coupons ─────────────────────────────────────────────────────────────
      .get("/coupons", requireStaff(ctx, "coupons:manage"), async (c) => {
        const rows = await ctx.db.select().from(coupons).orderBy(desc(coupons.createdAt));
        return c.json(ok(rows));
      })
      .post(
        "/coupons",
        requireStaff(ctx, "coupons:manage"),
        zValidator("json", couponInputSchema, (result, c) => {
          if (!result.success)
            return c.json(
              {
                ok: false as const,
                code: "VALIDATION_ERROR",
                message: "Invalid coupon",
                details: result.error.flatten().fieldErrors,
              },
              400,
            );
        }),
        async (c) => {
          const input = c.req.valid("json");
          const staff = c.get("user");
          const existing = await ctx.db
            .select({ id: coupons.id })
            .from(coupons)
            .where(eq(coupons.code, input.code));
          if (existing.length > 0) throw conflict("A coupon with this code exists");
          const [row] = await ctx.db
            .insert(coupons)
            .values({
              code: input.code,
              couponType: input.couponType,
              value: input.value,
              minOrderPaise: input.minOrderPaise,
              maxDiscountPaise: input.maxDiscountPaise ?? null,
              usageLimit: input.usageLimit ?? null,
              perUserLimit: input.perUserLimit,
              validFrom: input.validFrom ? new Date(input.validFrom) : null,
              validUntil: input.validUntil ? new Date(input.validUntil) : null,
              firstOrderOnly: input.firstOrderOnly,
              isActive: input.isActive,
            })
            .returning();
          await writeAudit(ctx.db, {
            actor: staff,
            action: "coupon.created",
            entityType: "coupon",
            entityId: row?.id,
            after: { code: input.code },
          });
          return c.json(ok(row), 201);
        },
      )
      .patch(
        "/coupons/:id",
        requireStaff(ctx, "coupons:manage"),
        zValidator("json", couponInputSchema.partial(), (result, c) => {
          if (!result.success)
            return c.json({ ok: false as const, code: "VALIDATION_ERROR", message: "Invalid coupon" }, 400);
        }),
        async (c) => {
          const id = c.req.param("id");
          const input = c.req.valid("json");
          const [row] = await ctx.db
            .update(coupons)
            .set({
              ...input,
              validFrom: input.validFrom ? new Date(input.validFrom) : undefined,
              validUntil: input.validUntil ? new Date(input.validUntil) : undefined,
              updatedAt: new Date(),
            })
            .where(eq(coupons.id, id))
            .returning();
          if (!row) throw notFound("Coupon not found");
          return c.json(ok(row));
        },
      )

      // ── Banners ─────────────────────────────────────────────────────────────
      .get("/banners", requireStaff(ctx, "banners:manage"), async (c) => {
        const rows = await ctx.db.select().from(banners).orderBy(asc(banners.sortOrder));
        return c.json(ok(rows));
      })
      .post(
        "/banners",
        requireStaff(ctx, "banners:manage"),
        zValidator("json", bannerInputSchema, (result, c) => {
          if (!result.success)
            return c.json(
              {
                ok: false as const,
                code: "VALIDATION_ERROR",
                message: "Invalid banner",
                details: result.error.flatten().fieldErrors,
              },
              400,
            );
        }),
        async (c) => {
          const input = c.req.valid("json");
          const [row] = await ctx.db
            .insert(banners)
            .values({
              ...input,
              subtitleEn: input.subtitleEn ?? null,
              subtitleMl: input.subtitleMl ?? null,
              linkUrl: input.linkUrl ?? null,
              badge: input.badge ?? null,
              startsAt: input.startsAt ? new Date(input.startsAt) : null,
              endsAt: input.endsAt ? new Date(input.endsAt) : null,
            })
            .returning();
          return c.json(ok(row), 201);
        },
      )
      .patch(
        "/banners/:id",
        requireStaff(ctx, "banners:manage"),
        zValidator("json", bannerInputSchema.partial(), (result, c) => {
          if (!result.success)
            return c.json({ ok: false as const, code: "VALIDATION_ERROR", message: "Invalid banner" }, 400);
        }),
        async (c) => {
          const id = c.req.param("id");
          const input = c.req.valid("json");
          const [row] = await ctx.db
            .update(banners)
            .set({
              ...input,
              startsAt: input.startsAt ? new Date(input.startsAt) : undefined,
              endsAt: input.endsAt ? new Date(input.endsAt) : undefined,
              updatedAt: new Date(),
            })
            .where(eq(banners.id, id))
            .returning();
          if (!row) throw notFound("Banner not found");
          return c.json(ok(row));
        },
      )
      .delete("/banners/:id", requireStaff(ctx, "banners:manage"), async (c) => {
        const id = c.req.param("id");
        const deleted = await ctx.db.delete(banners).where(eq(banners.id, id)).returning({ id: banners.id });
        if (deleted.length === 0) throw notFound("Banner not found");
        return c.json(ok({ deleted: id }));
      })

      // ── Review moderation ───────────────────────────────────────────────────
      .get("/reviews", requireStaff(ctx, "reviews:moderate"), async (c) => {
        const status = c.req.query("status");
        const rows = await ctx.db
          .select({
            id: reviews.id,
            productId: reviews.productId,
            productName: products.nameEn,
            productSlug: products.slug,
            userId: reviews.userId,
            authorName: user.name,
            rating: reviews.rating,
            title: reviews.title,
            body: reviews.body,
            status: reviews.status,
            replyBody: reviews.replyBody,
            orderId: reviews.orderId,
            createdAt: reviews.createdAt,
          })
          .from(reviews)
          .innerJoin(products, eq(reviews.productId, products.id))
          .innerJoin(user, eq(reviews.userId, user.id))
          .where(status ? eq(reviews.status, status as "pending" | "approved" | "hidden") : undefined)
          .orderBy(desc(reviews.createdAt))
          .limit(200);
        const verified = await ctx.db
          .select({ reviewId: reviews.id, orderId: reviews.orderId })
          .from(reviews)
          .where(sql`${reviews.orderId} is not null`);
        const verifiedSet = new Set(verified.map((v) => v.reviewId));
        return c.json(ok(rows.map((r) => ({ ...r, verifiedPurchase: verifiedSet.has(r.id) }))));
      })
      .post(
        "/reviews/:id/moderate",
        requireStaff(ctx, "reviews:moderate"),
        zValidator("json", moderateSchema, (result, c) => {
          if (!result.success)
            return c.json({ ok: false as const, code: "VALIDATION_ERROR", message: "Invalid status" }, 400);
        }),
        async (c) => {
          const id = c.req.param("id");
          const [row] = await ctx.db
            .update(reviews)
            .set({ status: c.req.valid("json").status, updatedAt: new Date() })
            .where(eq(reviews.id, id))
            .returning();
          if (!row) throw notFound("Review not found");
          return c.json(ok(row));
        },
      )
      .post(
        "/reviews/:id/reply",
        requireStaff(ctx, "reviews:moderate"),
        zValidator("json", reviewReplySchema, (result, c) => {
          if (!result.success)
            return c.json({ ok: false as const, code: "VALIDATION_ERROR", message: "Reply required" }, 400);
        }),
        async (c) => {
          const id = c.req.param("id");
          const [row] = await ctx.db
            .update(reviews)
            .set({ replyBody: c.req.valid("json").reply, repliedAt: new Date(), updatedAt: new Date() })
            .where(eq(reviews.id, id))
            .returning();
          if (!row) throw notFound("Review not found");
          return c.json(ok(row));
        },
      )
  );
}

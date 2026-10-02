import { newHono } from "../../lib/hono";
import { zValidator } from "@hono/zod-validator";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  categoryInputSchema,
  inventoryAdjustSchema,
  productInputSchema,
  quickPriceUpdateSchema,
  bulkPriceChangeSchema,
} from "@pgrs/contracts";
import { formatINR } from "@pgrs/contracts";
import {
  categories,
  inventory,
  inventoryMovements,
  orderItems,
  orders,
  productImages,
  productVariants,
  products,
} from "@pgrs/db";
import type { AppContext } from "../../lib/app-context";
import { badRequest, conflict, notFound, ok } from "../../lib/errors";
import { requireStaff } from "../../lib/context";
import { writeAudit } from "../../lib/audit";

/** Create or replace the full variant + image set for a product. */
type Tx = Parameters<Parameters<AppContext["db"]["transaction"]>[0]>[0];

export async function replaceProductChildren(
  db: AppContext["db"] | Tx,
  productId: string,
  input: {
    variants?: Array<Omit<typeof productVariants.$inferInsert, "productId" | "sku"> & { sku: string | null }>;
    images?: Array<{ url: string; alt: string | null }>;
  },
) {
  if (input.variants) {
    const current = await db.select().from(productVariants).where(eq(productVariants.productId, productId));
    const kept = new Set<string>();
    for (const [i, v] of input.variants.entries()) {
      const existing = v.id
        ? current.find((row) => row.id === v.id)
        : current.find(
            (row) =>
              !kept.has(row.id) &&
              (v.sku
                ? row.sku === v.sku
                : row.unitType === v.unitType && row.baseQuantity === v.baseQuantity),
          );
      if (v.id && !existing) throw badRequest("Variant does not belong to this product");
      if (existing && kept.has(existing.id)) throw badRequest("Duplicate variant");
      const { id: _id, ...fields } = v;
      const values = {
        ...fields,
        productId,
        sku: v.sku || existing?.sku || `${productId.slice(0, 8)}-${i}-${randomUUID().slice(0, 6)}`,
        sortOrder: v.sortOrder ?? i,
      };
      if (existing) {
        // Changing pack size would silently change the quantity in saved carts.
        if (existing.unitType !== v.unitType || existing.baseQuantity !== v.baseQuantity)
          throw conflict("Create a new variant to change its pack size");
        await db
          .update(productVariants)
          .set({ ...values, updatedAt: new Date() })
          .where(eq(productVariants.id, existing.id));
        kept.add(existing.id);
      } else {
        const [added] = await db.insert(productVariants).values(values).returning();
        if (added) kept.add(added.id);
      }
    }
    for (const old of current) {
      if (!kept.has(old.id))
        await db
          .update(productVariants)
          .set({ isActive: false, updatedAt: new Date() })
          .where(eq(productVariants.id, old.id));
    }
  }
  if (input.images) {
    await db.delete(productImages).where(eq(productImages.productId, productId));
    if (input.images.length)
      await db
        .insert(productImages)
        .values(
          input.images.map((img, i) => ({ productId, url: img.url, alt: img.alt ?? null, sortOrder: i })),
        );
  }
}

export function adminCatalogRoutes(ctx: AppContext) {
  return (
    newHono()
      // ── Categories ──────────────────────────────────────────────────────────
      .get("/categories", requireStaff(ctx, "catalog:manage"), async (c) => {
        const rows = await ctx.db.select().from(categories).orderBy(asc(categories.sortOrder));
        return c.json(ok(rows));
      })
      .post(
        "/categories",
        requireStaff(ctx, "catalog:manage"),
        zValidator("json", categoryInputSchema, (result, c) => {
          if (!result.success)
            return c.json(
              {
                ok: false as const,
                code: "VALIDATION_ERROR",
                message: "Invalid category",
                details: result.error.flatten().fieldErrors,
              },
              400,
            );
        }),
        async (c) => {
          const input = c.req.valid("json");
          const user = c.get("user");
          const existing = await ctx.db
            .select({ id: categories.id })
            .from(categories)
            .where(eq(categories.slug, input.slug));
          if (existing.length > 0) throw conflict("A category with this slug already exists");
          const [row] = await ctx.db
            .insert(categories)
            .values({ ...input, description: input.description ?? null, imageUrl: input.imageUrl ?? null })
            .returning();
          await writeAudit(ctx.db, {
            actor: user,
            action: "category.created",
            entityType: "category",
            entityId: row?.id,
            after: { slug: input.slug },
          });
          return c.json(ok(row), 201);
        },
      )
      .patch(
        "/categories/:id",
        requireStaff(ctx, "catalog:manage"),
        zValidator("json", categoryInputSchema.partial(), (result, c) => {
          if (!result.success)
            return c.json({ ok: false as const, code: "VALIDATION_ERROR", message: "Invalid category" }, 400);
        }),
        async (c) => {
          const id = c.req.param("id");
          const input = c.req.valid("json");
          const user = c.get("user");
          const [before] = await ctx.db.select().from(categories).where(eq(categories.id, id));
          if (!before) throw notFound("Category not found");
          if (input.slug && input.slug !== before.slug) {
            const [duplicate] = await ctx.db.select().from(categories).where(eq(categories.slug, input.slug));
            if (duplicate) throw conflict("A category with this slug already exists");
          }
          const [row] = await ctx.db
            .update(categories)
            .set({ ...input, updatedAt: new Date() })
            .where(eq(categories.id, id))
            .returning();
          if (!row) throw notFound("Category not found");
          await writeAudit(ctx.db, {
            actor: user,
            action: "category.updated",
            entityType: "category",
            entityId: id,
            before: { nameEn: before.nameEn },
            after: input as Record<string, unknown>,
          });
          return c.json(ok(row));
        },
      )
      .delete("/categories/:id", requireStaff(ctx, "catalog:manage"), async (c) => {
        const id = c.req.param("id");
        const user = c.get("user");
        const [{ count } = { count: 0 }] = await ctx.db
          .select({ count: sql<number>`count(*)::int` })
          .from(products)
          .where(eq(products.categoryId, id));
        if (count > 0) throw conflict("Move or delete the products in this category first");
        const deleted = await ctx.db
          .delete(categories)
          .where(eq(categories.id, id))
          .returning({ id: categories.id });
        if (deleted.length === 0) throw notFound("Category not found");
        await writeAudit(ctx.db, {
          actor: user,
          action: "category.deleted",
          entityType: "category",
          entityId: id,
        });
        return c.json(ok({ deleted: id }));
      })

      // ── Products ────────────────────────────────────────────────────────────
      .get("/products", requireStaff(ctx, "catalog:manage"), async (c) => {
        const q = (c.req.query("q") ?? "").toLowerCase();
        const categoryId = c.req.query("categoryId");
        const rows = await ctx.db
          .select({
            product: products,
            imageUrl: sql<
              string | null
            >`(select url from product_images where product_id = ${products.id} order by sort_order limit 1)`,
            categorySlug: categories.slug,
            categoryName: categories.nameEn,
            stock: inventory.stockQuantity,
            reserved: inventory.reservedQuantity,
            lowStockThreshold: inventory.lowStockThreshold,
            trackStock: sql<boolean>`coalesce(${inventory.trackStock}, true)`,
          })
          .from(products)
          .innerJoin(categories, eq(products.categoryId, categories.id))
          .leftJoin(inventory, eq(inventory.productId, products.id))
          .where(
            q
              ? sql`(lower(${products.nameEn}) like ${`%${q}%`} or ${products.nameMl} like ${`%${q}%`} or lower(${products.slug}) like ${`%${q}%`})`
              : categoryId
                ? eq(products.categoryId, categoryId)
                : undefined,
          )
          .orderBy(asc(products.nameEn));
        const variants = await ctx.db.select().from(productVariants).orderBy(asc(productVariants.sortOrder));
        return c.json(
          ok(
            rows.map((r) => ({
              ...r.product,
              categorySlug: r.categorySlug,
              categoryName: r.categoryName,
              stockQuantity: r.stock ?? 0,
              reservedQuantity: r.reserved ?? 0,
              lowStockThreshold: r.lowStockThreshold ?? 0,
              trackStock: r.trackStock,
              imageUrl: r.imageUrl,
              variants: variants.filter((v) => v.productId === r.product.id),
            })),
          ),
        );
      })
      .get("/products/:id", requireStaff(ctx, "catalog:manage"), async (c) => {
        const id = c.req.param("id");
        const [product] = await ctx.db.select().from(products).where(eq(products.id, id));
        if (!product) throw notFound("Product not found");
        const variants = await ctx.db
          .select()
          .from(productVariants)
          .where(eq(productVariants.productId, id))
          .orderBy(asc(productVariants.sortOrder));
        const images = await ctx.db
          .select()
          .from(productImages)
          .where(eq(productImages.productId, id))
          .orderBy(asc(productImages.sortOrder));
        const [inv] = await ctx.db.select().from(inventory).where(eq(inventory.productId, id));
        return c.json(ok({ product, variants, images, inventory: inv ?? null }));
      })
      .post(
        "/products",
        requireStaff(ctx, "catalog:manage"),
        zValidator("json", productInputSchema, (result, c) => {
          if (!result.success)
            return c.json(
              {
                ok: false as const,
                code: "VALIDATION_ERROR",
                message: "Invalid product",
                details: result.error.flatten().fieldErrors,
              },
              400,
            );
        }),
        async (c) => {
          const input = c.req.valid("json");
          const user = c.get("user");
          const existing = await ctx.db
            .select({ id: products.id })
            .from(products)
            .where(eq(products.slug, input.slug));
          if (existing.length > 0) throw conflict("A product with this slug already exists");

          const productId = randomUUID();
          const created = await ctx.db.transaction(async (tx) => {
            const [product] = await tx
              .insert(products)
              .values({
                id: productId,
                slug: input.slug,
                categoryId: input.categoryId,
                nameEn: input.nameEn,
                nameMl: input.nameMl,
                description: input.description ?? null,
                brand: input.brand ?? null,
                hsnCode: input.hsnCode,
                gstRate: input.gstRate,
                sellingType: input.sellingType,
                isFreshToday: input.isFreshToday,
                isActive: input.isActive,
                searchKeywords: input.searchKeywords,
              })
              .returning();
            await tx.insert(inventory).values({
              productId,
              stockQuantity: input.initialStock ?? 0,
              lowStockThreshold: input.lowStockThreshold,
            });
            await replaceProductChildren(tx, productId, {
              variants: input.variants.map((v) => ({
                unitType: v.unitType,
                baseQuantity: v.baseQuantity,
                labelEn: v.labelEn,
                labelMl: v.labelMl,
                pricePaise: v.pricePaise,
                mrpPaise: v.mrpPaise ?? null,
                stepQuantity: v.stepQuantity,
                sortOrder: v.sortOrder,
                isActive: v.isActive,
                sku: v.sku ?? null,
              })),
              images: input.images.map((i) => ({ url: i.url, alt: i.alt ?? null })),
            });
            await writeAudit(tx, {
              actor: user,
              action: "product.created",
              entityType: "product",
              entityId: productId,
              after: { slug: input.slug, nameEn: input.nameEn },
            });
            return product;
          });
          return c.json(ok(created), 201);
        },
      )
      .patch(
        "/products/:id",
        requireStaff(ctx, "catalog:manage"),
        zValidator("json", productInputSchema.partial(), (result, c) => {
          if (!result.success)
            return c.json(
              {
                ok: false as const,
                code: "VALIDATION_ERROR",
                message: "Invalid product",
                details: result.error.flatten().fieldErrors,
              },
              400,
            );
        }),
        async (c) => {
          const id = c.req.param("id");
          const input = c.req.valid("json");
          const user = c.get("user");
          const updated = await ctx.db.transaction(async (tx) => {
            const [before] = await tx.select().from(products).where(eq(products.id, id)).for("update");
            if (!before) throw notFound("Product not found");
            if (input.sellingType && input.sellingType !== before.sellingType)
              throw conflict("Create a new product to change its stock unit");
            const [row] = await tx
              .update(products)
              .set({
                ...input,
                description: input.description ?? before.description,
                brand: input.brand ?? before.brand,
                updatedAt: new Date(),
              })
              .where(eq(products.id, id))
              .returning();
            if (input.variants || input.images) {
              await replaceProductChildren(tx, id, {
                variants: input.variants?.map((v) => ({
                  id: v.id,
                  unitType: v.unitType,
                  baseQuantity: v.baseQuantity,
                  labelEn: v.labelEn,
                  labelMl: v.labelMl,
                  pricePaise: v.pricePaise,
                  mrpPaise: v.mrpPaise ?? null,
                  stepQuantity: v.stepQuantity,
                  sortOrder: v.sortOrder,
                  isActive: v.isActive,
                  sku: v.sku ?? null,
                })),
                images: input.images?.map((i) => ({ url: i.url, alt: i.alt ?? null })),
              });
            }
            if (input.lowStockThreshold != null) {
              await tx
                .update(inventory)
                .set({ lowStockThreshold: input.lowStockThreshold, updatedAt: new Date() })
                .where(eq(inventory.productId, id));
            }
            await writeAudit(tx, {
              actor: user,
              action: "product.updated",
              entityType: "product",
              entityId: id,
              before: { nameEn: before.nameEn, isActive: before.isActive },
              after: { nameEn: row?.nameEn, isActive: row?.isActive },
            });
            return row;
          });
          return c.json(ok(updated));
        },
      )
      .delete("/products/:id", requireStaff(ctx, "catalog:manage"), async (c) => {
        const id = c.req.param("id");
        const user = c.get("user");
        await ctx.db.transaction(async (tx) => {
          // Check only after locking stock: an in-flight reservation must commit first.
          const [product] = await tx.select().from(products).where(eq(products.id, id)).for("update");
          if (!product) throw notFound("Product not found");
          await tx.select().from(inventory).where(eq(inventory.productId, id)).for("update");
          const activeOrders = await tx
            .select({ id: orders.id })
            .from(orders)
            .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
            .where(
              and(
                eq(orderItems.productId, id),
                inArray(orders.status, [
                  "awaiting_confirmation",
                  "pending_payment",
                  "confirmed",
                  "packed",
                  "out_for_delivery",
                ]),
              ),
            )
            .limit(1);
          if (activeOrders.length)
            throw conflict("This product has open orders. Hide it instead of deleting it.");
          const deleted = await tx
            .delete(products)
            .where(eq(products.id, id))
            .returning({ id: products.id, slug: products.slug });
          if (deleted.length === 0) throw notFound("Product not found");
          await writeAudit(tx, {
            actor: user,
            action: "product.deleted",
            entityType: "product",
            entityId: id,
            after: deleted[0] as Record<string, unknown>,
          });
        });
        return c.json(ok({ deleted: id }));
      })
      .post("/products/:id/duplicate", requireStaff(ctx, "catalog:manage"), async (c) => {
        const id = c.req.param("id");
        const [source] = await ctx.db.select().from(products).where(eq(products.id, id));
        if (!source) throw notFound("Product not found");
        const suffix = randomUUID().slice(0, 6);
        const productId = randomUUID();
        await ctx.db.transaction(async (tx) => {
          await tx.insert(products).values({
            id: productId,
            slug: `${source.slug}-copy-${suffix}`,
            categoryId: source.categoryId,
            nameEn: `${source.nameEn} (copy)`,
            nameMl: source.nameMl,
            description: source.description,
            brand: source.brand,
            hsnCode: source.hsnCode,
            gstRate: source.gstRate,
            sellingType: source.sellingType,
            isFreshToday: false,
            isActive: false,
            searchKeywords: source.searchKeywords,
          });
          await tx.insert(inventory).values({ productId, stockQuantity: 0, lowStockThreshold: 0 });
          const variants = await tx.select().from(productVariants).where(eq(productVariants.productId, id));
          if (variants.length > 0) {
            await tx.insert(productVariants).values(
              variants.map((v) => ({
                productId,
                sku: `${v.sku}-${suffix}`,
                unitType: v.unitType,
                baseQuantity: v.baseQuantity,
                labelEn: v.labelEn,
                labelMl: v.labelMl,
                pricePaise: v.pricePaise,
                mrpPaise: v.mrpPaise,
                stepQuantity: v.stepQuantity,
                sortOrder: v.sortOrder,
                isActive: v.isActive,
              })),
            );
          }
          const images = await tx.select().from(productImages).where(eq(productImages.productId, id));
          if (images.length > 0) {
            await tx
              .insert(productImages)
              .values(images.map((i) => ({ productId, url: i.url, alt: i.alt, sortOrder: i.sortOrder })));
          }
        });
        return c.json(ok({ id: productId }), 201);
      })

      // ── Quick price update (daily vegetable price board) ────────────────────
      .post(
        "/catalog/quick-price",
        requireStaff(ctx, "catalog:manage"),
        zValidator("json", quickPriceUpdateSchema, (result, c) => {
          if (!result.success)
            return c.json({ ok: false as const, code: "VALIDATION_ERROR", message: "Invalid updates" }, 400);
        }),
        async (c) => {
          const input = c.req.valid("json");
          const user = c.get("user");
          const changed: Array<{ variantId: string; from: number; to: number }> = [];
          await ctx.db.transaction(async (tx) => {
            const variantIds = input.updates.map((u) => u.variantId);
            const current = await tx
              .select({
                id: productVariants.id,
                pricePaise: productVariants.pricePaise,
                mrpPaise: productVariants.mrpPaise,
                sku: productVariants.sku,
              })
              .from(productVariants)
              .where(inArray(productVariants.id, variantIds))
              .orderBy(asc(productVariants.id))
              .for("update");
            const currentMap = new Map(current.map((v) => [v.id, v]));
            for (const update of input.updates) {
              const existing = currentMap.get(update.variantId);
              if (!existing) throw badRequest("Unknown variant in price updates");
              const mrpPaise = update.mrpPaise === undefined ? existing.mrpPaise : update.mrpPaise;
              if (existing.pricePaise === update.pricePaise && existing.mrpPaise === mrpPaise) continue;
              changed.push({ variantId: update.variantId, from: existing.pricePaise, to: update.pricePaise });
              await tx
                .update(productVariants)
                .set({
                  pricePaise: update.pricePaise,
                  mrpPaise,
                  updatedAt: new Date(),
                })
                .where(eq(productVariants.id, update.variantId));
            }
            if (changed.length > 0) {
              await writeAudit(tx, {
                actor: user,
                action: "product.prices_updated",
                entityType: "product_variants",
                after: {
                  count: changed.length,
                  changes: changed.slice(0, 200).map((ch) => ({
                    variantId: ch.variantId,
                    fromPaise: ch.from,
                    toPaise: ch.to,
                  })),
                },
              });
            }
          });
          return c.json(ok({ updated: changed.length, changes: changed }));
        },
      )
      .post(
        "/catalog/bulk-price-preview",
        requireStaff(ctx, "catalog:manage"),
        zValidator("json", bulkPriceChangeSchema, (result, c) => {
          if (!result.success)
            return c.json(
              { ok: false as const, code: "VALIDATION_ERROR", message: "Invalid bulk change" },
              400,
            );
        }),
        async (c) => {
          const { categorySlug, percentChange } = c.req.valid("json");
          const rows = await ctx.db
            .select({
              variantId: productVariants.id,
              sku: productVariants.sku,
              label: productVariants.labelEn,
              nameEn: products.nameEn,
              categorySlug: categories.slug,
              pricePaise: productVariants.pricePaise,
            })
            .from(productVariants)
            .innerJoin(products, eq(productVariants.productId, products.id))
            .innerJoin(categories, eq(products.categoryId, categories.id))
            .where(
              and(
                eq(productVariants.isActive, true),
                categorySlug ? eq(categories.slug, categorySlug) : undefined,
              ),
            );
          const preview = rows.map((r) => ({
            variantId: r.variantId,
            sku: r.sku,
            nameEn: r.nameEn,
            label: r.label,
            currentPaise: r.pricePaise,
            newPaise: Math.max(0, Math.round((r.pricePaise * (100 + percentChange)) / 100)),
          }));
          return c.json(
            ok({
              count: preview.length,
              sample: preview.slice(0, 10),
              updates: preview.map((p) => ({ variantId: p.variantId, pricePaise: p.newPaise })),
              note: `Prices ${percentChange >= 0 ? "up" : "down"} by ${Math.abs(percentChange)}% (${formatINR(0)} base)`,
            }),
          );
        },
      )

      // ── CSV import / export ─────────────────────────────────────────────────
      .get("/catalog/export.csv", requireStaff(ctx, "catalog:manage"), async (_c) => {
        const rows = await ctx.db
          .select({
            slug: products.slug,
            nameEn: products.nameEn,
            nameMl: products.nameMl,
            category: categories.slug,
            hsnCode: products.hsnCode,
            gstRate: products.gstRate,
            sellingType: products.sellingType,
            isActive: products.isActive,
            variantSku: productVariants.sku,
            variantLabel: productVariants.labelEn,
            unitType: productVariants.unitType,
            baseQuantity: productVariants.baseQuantity,
            pricePaise: productVariants.pricePaise,
            mrpPaise: productVariants.mrpPaise,
            stock: inventory.stockQuantity,
          })
          .from(products)
          .innerJoin(categories, eq(products.categoryId, categories.id))
          .leftJoin(productVariants, eq(productVariants.productId, products.id))
          .leftJoin(inventory, eq(inventory.productId, products.id))
          .orderBy(asc(products.nameEn), asc(productVariants.sortOrder));

        const header = [
          "slug",
          "name_en",
          "name_ml",
          "category",
          "hsn",
          "gst_rate",
          "selling_type",
          "is_active",
          "variant_sku",
          "variant_label",
          "unit_type",
          "base_quantity",
          "price_paise",
          "mrp_paise",
          "stock",
        ].join(",");
        const escape = (value: unknown): string => {
          const s = value == null ? "" : String(value);
          return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
        };
        const lines = rows.map((r) =>
          [
            r.slug,
            r.nameEn,
            r.nameMl,
            r.category,
            r.hsnCode,
            r.gstRate,
            r.sellingType,
            r.isActive,
            r.variantSku,
            r.variantLabel,
            r.unitType,
            r.baseQuantity,
            r.pricePaise,
            r.mrpPaise,
            r.stock,
          ]
            .map(escape)
            .join(","),
        );
        return new Response([header, ...lines].join("\n"), {
          headers: {
            "content-type": "text/csv; charset=utf-8",
            "content-disposition": `attachment; filename="pgrs-catalog-${new Date().toISOString().slice(0, 10)}.csv"`,
          },
        });
      })
      .post("/catalog/import.csv", requireStaff(ctx, "catalog:manage"), async (c) => {
        const user = c.get("user");
        const contentType = c.req.header("content-type") ?? "";
        if (!contentType.includes("text/csv") && !contentType.includes("octet-stream")) {
          throw badRequest("Upload a CSV file (content-type text/csv)");
        }
        const body = await c.req.raw.text();
        const lines = body.split(/\r?\n/).filter((l) => l.trim().length > 0);
        if (lines.length < 2) throw badRequest("CSV needs a header row and at least one data row");
        const header = lines[0]!.split(",").map((h) => h.trim());
        const expected = [
          "slug",
          "name_en",
          "name_ml",
          "category",
          "hsn",
          "gst_rate",
          "selling_type",
          "is_active",
          "variant_sku",
          "variant_label",
          "unit_type",
          "base_quantity",
          "price_paise",
        ];
        for (const col of expected) {
          if (!header.includes(col)) throw badRequest(`CSV is missing the "${col}" column`);
        }
        let imported = 0;
        const errors: string[] = [];
        await ctx.db.transaction(async (tx) => {
          for (const line of lines.slice(1)) {
            const cells = parseCsvLine(line);
            const row = Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ""]));
            try {
              const [category] = await tx
                .select()
                .from(categories)
                .where(eq(categories.slug, row["category"] ?? ""));
              if (!category) throw new Error(`category "${row["category"]}" not found`);
              let [product] = await tx
                .select()
                .from(products)
                .where(eq(products.slug, row["slug"] ?? ""));
              if (!product) {
                [product] = await tx
                  .insert(products)
                  .values({
                    slug: row["slug"] ?? "",
                    categoryId: category.id,
                    nameEn: row["name_en"] ?? "",
                    nameMl: row["name_ml"] ?? "",
                    hsnCode: row["hsn"] ?? "",
                    gstRate: Number(row["gst_rate"] ?? 0) || 0,
                    sellingType: row["selling_type"] === "packaged" ? "packaged" : "loose",
                    isActive: (row["is_active"] ?? "true") === "true",
                  })
                  .returning();
                await tx.insert(inventory).values({
                  productId: product!.id,
                  stockQuantity: Number(row["stock"] ?? 0) || 0,
                });
              }
              const sku = row["variant_sku"] ?? "";
              const [existingVariant] = await tx
                .select()
                .from(productVariants)
                .where(eq(productVariants.sku, sku));
              const values = {
                productId: product!.id,
                sku,
                unitType: row["unit_type"] === "unit" ? ("unit" as const) : ("weight" as const),
                baseQuantity: Number(row["base_quantity"] ?? 1) || 1,
                labelEn: row["variant_label"] ?? "",
                labelMl: row["name_ml"] ?? "",
                pricePaise: Number(row["price_paise"] ?? 0) || 0,
                mrpPaise: row["mrp_paise"] ? Number(row["mrp_paise"]) : null,
              };
              if (existingVariant) {
                await tx
                  .update(productVariants)
                  .set(values)
                  .where(eq(productVariants.id, existingVariant.id));
              } else {
                await tx.insert(productVariants).values(values);
              }
              imported += 1;
            } catch (err) {
              errors.push(`row "${row["slug"]}": ${err instanceof Error ? err.message : String(err)}`);
            }
          }
          await writeAudit(tx, {
            actor: user,
            action: "catalog.csv_imported",
            entityType: "catalog",
            after: { imported, errors: errors.length },
          });
        });
        return c.json(ok({ imported, errors }));
      })

      // ── Inventory ───────────────────────────────────────────────────────────
      .get("/inventory", requireStaff(ctx, "orders:view"), async (c) => {
        const rows = await ctx.db
          .select({
            productId: products.id,
            slug: products.slug,
            nameEn: products.nameEn,
            nameMl: products.nameMl,
            sellingType: products.sellingType,
            stockQuantity: sql<number>`coalesce(${inventory.stockQuantity}, 0)`,
            reservedQuantity: sql<number>`coalesce(${inventory.reservedQuantity}, 0)`,
            lowStockThreshold: sql<number>`coalesce(${inventory.lowStockThreshold}, 0)`,
            trackStock: sql<boolean>`coalesce(${inventory.trackStock}, true)`,
          })
          .from(products)
          .leftJoin(inventory, eq(inventory.productId, products.id))
          .where(eq(products.isActive, true))
          .orderBy(asc(products.nameEn));
        return c.json(ok(rows));
      })
      .post(
        "/inventory/adjust",
        requireStaff(ctx, "inventory:manage"),
        zValidator("json", inventoryAdjustSchema, (result, c) => {
          if (!result.success)
            return c.json(
              { ok: false as const, code: "VALIDATION_ERROR", message: "Invalid adjustment" },
              400,
            );
        }),
        async (c) => {
          const input = c.req.valid("json");
          const user = c.get("user");
          await ctx.db.transaction(async (tx) => {
            await tx
              .select({ id: products.id })
              .from(products)
              .where(eq(products.id, input.productId))
              .for("key share");
            const [inv] = await tx
              .select()
              .from(inventory)
              .where(eq(inventory.productId, input.productId))
              .for("update");
            if (!inv) throw notFound("Product inventory not found");
            const newStock = inv.stockQuantity + input.quantityDelta;
            if (newStock < inv.reservedQuantity) {
              throw conflict("Adjustment would go below the reserved quantity");
            }
            await tx
              .update(inventory)
              .set({ stockQuantity: newStock, updatedAt: new Date() })
              .where(eq(inventory.productId, input.productId));
            await tx.insert(inventoryMovements).values({
              productId: input.productId,
              movementType: input.movementType,
              quantityDelta: input.quantityDelta,
              reason: input.reason,
              referenceType: "manual",
              performedBy: user.id,
            });
            await writeAudit(tx, {
              actor: user,
              action: "inventory.adjusted",
              entityType: "product",
              entityId: input.productId,
              before: { stock: inv.stockQuantity },
              after: { stock: newStock, reason: input.reason },
            });
          });
          return c.json(ok({ adjusted: true }));
        },
      )
      .get("/inventory/movements", requireStaff(ctx, "orders:view"), async (c) => {
        const productId = c.req.query("productId");
        const rows = await ctx.db
          .select()
          .from(inventoryMovements)
          .where(productId ? eq(inventoryMovements.productId, productId) : undefined)
          .orderBy(desc(inventoryMovements.createdAt))
          .limit(200);
        return c.json(ok(rows));
      })
  );
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      cells.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

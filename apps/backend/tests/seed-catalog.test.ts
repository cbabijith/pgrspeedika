import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, schema, seedCatalog, type Database } from "@pgrs/db";

/**
 * Catalog seed contract: 30+ vegetables with Malayalam + English names and
 * positive per-kg prices, every product has priced weight variants, and the
 * full catalog stays rich (60+ products, 7+ categories).
 */
const dbUrl = process.env.DATABASE_URL;
const d = dbUrl ? describe : describe.skip;

let db: Database | null = null;
let connected = false;

async function tryConnect(): Promise<boolean> {
  if (!dbUrl) return false;
  db = createDb(dbUrl, { max: 4 });
  try {
    await db.select({ key: schema.settings.key }).from(schema.settings).limit(1);
    return true;
  } catch {
    db = null;
    return false;
  }
}

d("catalog seed (integration)", () => {
  beforeAll(async () => {
    connected = await tryConnect();
    if (connected && db) await seedCatalog(db);
  });

  afterAll(async () => {
    if (!db) return;
    await db.delete(schema.inventoryMovements);
    await db.delete(schema.inventory);
    await db.delete(schema.productImages);
    await db.delete(schema.productVariants);
    await db.delete(schema.products);
    await db.delete(schema.categories);
    await db.delete(schema.settings);
    await db.delete(schema.deliveryZones);
    await db.delete(schema.deliverySlots);
    await db.delete(schema.coupons);
    await db.delete(schema.banners);
  });

  it("seeds 30+ vegetables, every one bilingual with a positive price", async () => {
    const [vegetables] = await db!
      .select()
      .from(schema.categories)
      .where(eq(schema.categories.slug, "vegetables"));
    expect(vegetables).toBeDefined();

    const rows = await db!
      .select({
        nameEn: schema.products.nameEn,
        nameMl: schema.products.nameMl,
        hsn: schema.products.hsnCode,
        price: schema.productVariants.pricePaise,
        base: schema.productVariants.baseQuantity,
      })
      .from(schema.products)
      .innerJoin(schema.productVariants, eq(schema.productVariants.productId, schema.products.id))
      .where(eq(schema.products.categoryId, vegetables!.id));

    const products = new Set(rows.map((r) => r.nameEn));
    expect(products.size).toBeGreaterThanOrEqual(30);

    for (const row of rows) {
      expect(row.nameEn.length).toBeGreaterThan(1);
      expect(row.nameMl.length).toBeGreaterThan(1);
      expect(row.price).toBeGreaterThan(0);
      expect(row.base).toBeGreaterThan(0);
      expect(row.hsn.length).toBeGreaterThan(0);
    }
  });

  it("seeds a rich full catalog (60+ products across 7+ categories)", async () => {
    const cats = await db!.select().from(schema.categories);
    expect(cats.length).toBeGreaterThanOrEqual(7);
    const products = await db!.select().from(schema.products);
    expect(products.length).toBeGreaterThanOrEqual(60);
  });

  it("gives every loose vegetable 250 g / 500 g / 1 kg style variants with proportional prices", async () => {
    const [vegetables] = await db!
      .select()
      .from(schema.categories)
      .where(eq(schema.categories.slug, "vegetables"));
    const rows = await db!
      .select({
        slug: schema.products.slug,
        sellingType: schema.products.sellingType,
        label: schema.productVariants.labelEn,
        price: schema.productVariants.pricePaise,
        base: schema.productVariants.baseQuantity,
      })
      .from(schema.products)
      .innerJoin(schema.productVariants, eq(schema.productVariants.productId, schema.products.id))
      .where(eq(schema.products.categoryId, vegetables!.id));

    const bySlug = new Map<string, typeof rows>();
    for (const row of rows) {
      const list = bySlug.get(row.slug) ?? [];
      list.push(row);
      bySlug.set(row.slug, list);
    }
    for (const [slug, list] of bySlug) {
      if (list[0]?.sellingType !== "loose") continue;
      expect(list.length).toBeGreaterThanOrEqual(2);
      const kilo = list.find((v) => v.base === 1000);
      if (kilo) {
        // A 250 g pack must cost ~25% of the kilo pack (±₹1 rounding).
        const quarter = list.find((v) => v.base === 250);
        if (quarter) {
          expect(Math.abs(quarter.price * 4 - kilo.price)).toBeLessThanOrEqual(400);
        }
      }
      void slug;
    }
  });
});

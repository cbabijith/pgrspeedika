import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, schema } from "@pgrs/db";
import { reserveStock, releaseStock, commitSale } from "../src/services/stock";
import { bookSlot, releaseSlot, slotAvailabilityForDate, istTodayDateString } from "../src/services/slots";

/**
 * Integration tests against a real Postgres (DATABASE_URL). They are skipped
 * automatically when no database is reachable so `pnpm test` works anywhere.
 * All statements go through Drizzle's query builder (parameterized).
 */
const dbUrl = process.env.DATABASE_URL;

let db: ReturnType<typeof createDb> | null = null;

async function tryConnect(): Promise<boolean> {
  if (!dbUrl) return false;
  db = createDb(dbUrl, { max: 4 });
  try {
    await db.select({ id: schema.settings.key }).from(schema.settings).limit(1);
    return true;
  } catch {
    db = null;
    return false;
  }
}

const connected = await tryConnect();
const dd = connected ? describe : describe.skip;

async function clearCatalogAndSlots() {
  if (!db) return;
  await db.delete(schema.inventoryMovements);
  await db.delete(schema.inventory);
  await db.delete(schema.products);
  await db.delete(schema.categories);
  await db.delete(schema.slotBookings);
  await db.delete(schema.deliverySlots);
}

dd("stock reservation (integration)", () => {
  let productId = "";

  beforeAll(async () => {
    if (!db) return;
    await clearCatalogAndSlots();
    const [category] = await db
      .insert(schema.categories)
      .values({ slug: "test-cat", nameEn: "Test", nameMl: "ടെസ്റ്റ്" })
      .returning();
    const [product] = await db
      .insert(schema.products)
      .values({
        slug: "stock-test-product",
        categoryId: category!.id,
        nameEn: "Stock Tomato",
        nameMl: "സ്റ്റോക്ക് തക്കാളി",
        sellingType: "loose",
      })
      .returning();
    productId = product!.id;
    await db.insert(schema.inventory).values({
      productId,
      stockQuantity: 10_000, // 10 kg
      reservedQuantity: 0,
      lowStockThreshold: 2_000,
    });
  });

  afterAll(async () => {
    await clearCatalogAndSlots();
  });

  it("reserves stock and rejects over-reservation", async () => {
    await db!.transaction(async (tx) => {
      await reserveStock(tx, [{ productId, nameEn: "Stock Tomato", amount: 6_000 }], "order-1");
    });
    const [row] = await db.select().from(schema.inventory).where(eq(schema.inventory.productId, productId));
    expect(row?.reservedQuantity).toBe(6_000);

    // Reserving another 5kg must fail (only 4kg unreserved).
    await expect(
      db!.transaction(async (tx) => {
        await reserveStock(tx, [{ productId, nameEn: "Stock Tomato", amount: 5_000 }], "order-2");
      }),
    ).rejects.toThrowError(/out of stock/i);

    // A failed reservation rolls back entirely.
    const [after] = await db.select().from(schema.inventory).where(eq(schema.inventory.productId, productId));
    expect(after?.reservedQuantity).toBe(6_000);
  });

  it("releases reservations", async () => {
    await db!.transaction(async (tx) => {
      await releaseStock(tx, [{ productId, nameEn: "Stock Tomato", amount: 6_000 }], "order-1");
    });
    const [row] = await db.select().from(schema.inventory).where(eq(schema.inventory.productId, productId));
    expect(row?.reservedQuantity).toBe(0);
    expect(row?.stockQuantity).toBe(10_000);
  });

  it("commits a sale with the actual packed weight", async () => {
    await db!.transaction(async (tx) => {
      await reserveStock(tx, [{ productId, nameEn: "Stock Tomato", amount: 1_000 }], "order-3");
    });
    await db!.transaction(async (tx) => {
      await commitSale(
        tx,
        [
          {
            productId,
            nameEn: "Stock Tomato",
            soldAmount: 940,
            reservedAmount: 1_000,
            lowStockThreshold: 2_000,
          },
        ],
        "order-3",
      );
    });
    const [row] = await db.select().from(schema.inventory).where(eq(schema.inventory.productId, productId));
    expect(row?.stockQuantity).toBe(10_000 - 940);
    expect(row?.reservedQuantity).toBe(0);
  });
});

dd("slot capacity (integration)", () => {
  let slotId = "";
  const date = istTodayDateString();

  beforeAll(async () => {
    if (!db) return;
    await db.delete(schema.slotBookings);
    await db.delete(schema.deliverySlots);
    const [slot] = await db
      .insert(schema.deliverySlots)
      .values({
        nameEn: "Test slot 11 PM–12 AM",
        nameMl: "ടെസ്റ്റ് സ്ലോട്ട്",
        startMinutes: 23 * 60,
        endMinutes: 24 * 60,
        cutoffMinutes: 0,
        capacity: 2,
      })
      .returning();
    slotId = slot!.id;
  });

  afterAll(async () => {
    if (!db) return;
    await db.delete(schema.slotBookings);
    await db.delete(schema.deliverySlots);
  });

  it("books up to capacity and refuses one more", async () => {
    await db!.transaction(async (tx) => {
      await bookSlot(tx, slotId, date);
    });
    await db!.transaction(async (tx) => {
      await bookSlot(tx, slotId, date);
    });
    const availability = await slotAvailabilityForDate(db!, date);
    const mine = availability.find((a) => a.id === slotId);
    expect(mine?.remaining).toBe(0);

    await expect(
      db!.transaction(async (tx) => {
        await bookSlot(tx, slotId, date);
      }),
    ).rejects.toThrowError(/full|closed/i);
  });

  it("releases a booking", async () => {
    await db!.transaction(async (tx) => {
      await releaseSlot(tx, slotId, date);
    });
    const availability = await slotAvailabilityForDate(db!, date);
    const mine = availability.find((a) => a.id === slotId);
    expect(mine?.remaining).toBe(1);
  });
});

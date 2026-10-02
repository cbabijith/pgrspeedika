import { and, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "@pgrs/db";
import { EVENTS } from "@pgrs/events";
import { inventory, inventoryMovements, products } from "@pgrs/db";
import { OutboxPublisher } from "@pgrs/events";
import { badRequest, outOfStock } from "../lib/errors";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export interface StockReservationItem {
  productId: string;
  nameEn: string;
  /** Grams for loose goods, units for packaged goods. */
  amount: number;
}

function aggregateReservations(items: StockReservationItem[]): StockReservationItem[] {
  const grouped = new Map<string, StockReservationItem>();
  for (const item of items) {
    if (!Number.isSafeInteger(item.amount) || item.amount <= 0) throw badRequest("Invalid stock quantity");
    const existing = grouped.get(item.productId);
    grouped.set(item.productId, { ...item, amount: item.amount + (existing?.amount ?? 0) });
  }
  // Every checkout locks products in the same order, avoiding cross-cart deadlocks.
  return [...grouped.values()].sort((a, b) => a.productId.localeCompare(b.productId));
}

async function lockProducts(tx: Tx, ids: string[]) {
  if (!ids.length) return;
  // Catalog edits and deletion lock products before inventory; stock writes use the same order.
  await tx
    .select({ id: products.id })
    .from(products)
    .where(inArray(products.id, ids))
    .orderBy(products.id)
    .for("key share");
}

/**
 * Reserve stock for an order inside a transaction. Each row update succeeds
 * only when enough unreserved stock exists, so concurrent orders cannot
 * oversell. Throws OUT_OF_STOCK naming the offending items.
 */
export async function reserveStock(
  tx: Tx,
  items: StockReservationItem[],
  referenceId: string,
): Promise<void> {
  const failed: string[] = [];
  const grouped = aggregateReservations(items);
  await lockProducts(
    tx,
    grouped.map((i) => i.productId),
  );
  for (const item of grouped) {
    const rows = await tx
      .update(inventory)
      .set({
        reservedQuantity: sql`case when ${inventory.trackStock} then ${inventory.reservedQuantity} + ${item.amount} else ${inventory.reservedQuantity} end`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(inventory.productId, item.productId),
          sql`(not ${inventory.trackStock} or ${inventory.stockQuantity} - ${inventory.reservedQuantity} >= ${item.amount})`,
        ),
      )
      .returning({ productId: inventory.productId, trackStock: inventory.trackStock });
    if (rows.length === 0) {
      failed.push(item.nameEn);
    } else if (rows[0]?.trackStock) {
      await tx.insert(inventoryMovements).values({
        productId: item.productId,
        movementType: "reserve",
        quantityDelta: item.amount,
        reason: `Reserved for order`,
        referenceType: "order",
        referenceId,
      });
    }
  }
  if (failed.length > 0) {
    // Roll back happens via the surrounding transaction.
    throw outOfStock(failed);
  }
}

/** Give back a reservation (cancellation / payment failure). */
export async function releaseStock(
  tx: Tx,
  items: StockReservationItem[],
  referenceId: string,
): Promise<void> {
  const grouped = aggregateReservations(items);
  await lockProducts(
    tx,
    grouped.map((i) => i.productId),
  );
  for (const item of grouped) {
    const updated = await tx
      .update(inventory)
      .set({
        reservedQuantity: sql`GREATEST(${inventory.reservedQuantity} - ${item.amount}, 0)`,
        updatedAt: new Date(),
      })
      .where(and(eq(inventory.productId, item.productId), eq(inventory.trackStock, true)))
      .returning();
    if (!updated.length) continue;
    await tx.insert(inventoryMovements).values({
      productId: item.productId,
      movementType: "release",
      quantityDelta: -item.amount,
      reason: "Reservation released",
      referenceType: "order",
      referenceId,
    });
  }
}

export interface SaleItem {
  productId: string;
  nameEn: string;
  /** Amount actually sold (final grams for loose goods). */
  soldAmount: number;
  /** Amount that had been reserved (ordered amount). */
  reservedAmount: number;
  lowStockThreshold: number;
}

/**
 * Commit a sale at packing: stock goes down by the sold amount, the
 * reservation is cleared, and low-stock/depleted events are emitted on the
 * same transaction's outbox.
 */
export async function commitSale(tx: Tx, items: SaleItem[], referenceId: string): Promise<void> {
  const grouped = new Map<string, SaleItem>();
  for (const item of items) {
    const old = grouped.get(item.productId);
    grouped.set(item.productId, {
      ...item,
      soldAmount: item.soldAmount + (old?.soldAmount ?? 0),
      reservedAmount: item.reservedAmount + (old?.reservedAmount ?? 0),
    });
  }
  const sorted = [...grouped.values()].sort((a, b) => a.productId.localeCompare(b.productId));
  await lockProducts(
    tx,
    sorted.map((i) => i.productId),
  );
  for (const item of sorted) {
    const updated = await tx
      .update(inventory)
      .set({
        stockQuantity: sql`case when ${inventory.trackStock} then ${inventory.stockQuantity} - ${item.soldAmount} else ${inventory.stockQuantity} end`,
        reservedQuantity: sql`case when ${inventory.trackStock} then ${inventory.reservedQuantity} - ${item.reservedAmount} else ${inventory.reservedQuantity} end`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(inventory.productId, item.productId),
          sql`(not ${inventory.trackStock} or (${inventory.reservedQuantity} >= ${item.reservedAmount} and ${inventory.stockQuantity} - ${item.soldAmount} >= ${inventory.reservedQuantity} - ${item.reservedAmount}))`,
        ),
      )
      .returning();
    if (!updated.length) throw outOfStock([item.nameEn]);
    if (updated[0]?.trackStock)
      await tx.insert(inventoryMovements).values({
        productId: item.productId,
        movementType: "sale",
        quantityDelta: -item.soldAmount,
        reason: "Packed for order",
        referenceType: "order",
        referenceId,
      });
  }
  await emitStockEvents(tx, [...grouped.values()]);
}

/** Available-to-sell for a product (stock minus reservations). */
export async function availableFor(tx: Tx, productId: string): Promise<number> {
  const [row] = await tx
    .select({
      stock: inventory.stockQuantity,
      reserved: inventory.reservedQuantity,
      track: inventory.trackStock,
    })
    .from(inventory)
    .where(eq(inventory.productId, productId));
  if (!row || !row.track) return Number.MAX_SAFE_INTEGER;
  return Math.max(0, row.stock - row.reserved);
}

async function emitStockEvents(tx: Tx, items: SaleItem[]): Promise<void> {
  const outbox = new OutboxPublisher(tx);
  for (const item of items) {
    const [row] = await tx
      .select({
        stock: inventory.stockQuantity,
        reserved: inventory.reservedQuantity,
        low: inventory.lowStockThreshold,
        track: inventory.trackStock,
      })
      .from(inventory)
      .where(eq(inventory.productId, item.productId));
    if (!row || !row.track) continue;
    const available = Math.max(0, row.stock - row.reserved);
    const payload = {
      productId: item.productId,
      nameEn: item.nameEn,
      available,
      lowStockThreshold: row.low,
    };
    if (available <= 0) {
      await outbox.publish(EVENTS.stockDepleted, payload);
    } else if (row.low > 0 && available <= row.low) {
      await outbox.publish(EVENTS.stockLow, payload);
    }
  }
}

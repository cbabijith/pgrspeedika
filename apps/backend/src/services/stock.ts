import { and, eq, sql } from "drizzle-orm";
import type { Database } from "@pgrs/db";
import { EVENTS } from "@pgrs/events";
import { inventory, inventoryMovements } from "@pgrs/db";
import { OutboxPublisher } from "@pgrs/events";
import { outOfStock } from "../lib/errors";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export interface StockReservationItem {
  productId: string;
  nameEn: string;
  /** Grams for loose goods, units for packaged goods. */
  amount: number;
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
  for (const item of items) {
    const rows = await tx
      .update(inventory)
      .set({
        reservedQuantity: sql`${inventory.reservedQuantity} + ${item.amount}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(inventory.productId, item.productId),
          eq(inventory.trackStock, true),
          sql`${inventory.stockQuantity} - ${inventory.reservedQuantity} >= ${item.amount}`,
        ),
      )
      .returning({ productId: inventory.productId });
    if (rows.length === 0) {
      failed.push(item.nameEn);
    } else {
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
  for (const item of items) {
    await tx
      .update(inventory)
      .set({
        reservedQuantity: sql`GREATEST(${inventory.reservedQuantity} - ${item.amount}, 0)`,
        updatedAt: new Date(),
      })
      .where(eq(inventory.productId, item.productId));
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
  for (const item of items) {
    await tx
      .update(inventory)
      .set({
        stockQuantity: sql`${inventory.stockQuantity} - ${item.soldAmount}`,
        reservedQuantity: sql`GREATEST(${inventory.reservedQuantity} - ${item.reservedAmount}, 0)`,
        updatedAt: new Date(),
      })
      .where(eq(inventory.productId, item.productId));
    await tx.insert(inventoryMovements).values({
      productId: item.productId,
      movementType: "sale",
      quantityDelta: -item.soldAmount,
      reason: "Packed for order",
      referenceType: "order",
      referenceId,
    });
  }
  await emitStockEvents(tx, items);
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
      })
      .from(inventory)
      .where(eq(inventory.productId, item.productId));
    if (!row) continue;
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

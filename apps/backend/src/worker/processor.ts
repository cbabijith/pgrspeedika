import { eq, sql } from "drizzle-orm";
import { outboxEvents, type Database } from "@pgrs/db";
import type { AppContext } from "../lib/app-context";
import { log } from "../lib/app-context";
import { dispatchEvent } from "./handlers";

/** Locks serialize each event; a savepoint rolls back handler writes before retrying. */
export async function processBatch(ctx: AppContext, batchSize = 10): Promise<number> {
  return ctx.db.transaction(async (tx) => {
    const rows = await tx.execute(sql`select id from outbox_events
      where status = 'pending' and next_attempt_at <= now()
      order by created_at asc limit ${batchSize} for update skip locked`);
    for (const row of rows as unknown as Array<{ id: string }>) {
      const [event] = await tx.select().from(outboxEvents).where(eq(outboxEvents.id, row.id));
      if (!event) continue;
      try {
        await tx.transaction(async (handlerTx) => {
          await dispatchEvent(event.eventName, event.payload, {
            ...ctx,
            db: handlerTx as unknown as Database,
            notifier: {
              name: ctx.notifier.name,
              send: (message) =>
                ctx.notifier.send({
                  ...message,
                  idempotencyKey: `${event.id}:${message.channel}:${message.to ?? "staff"}`,
                }),
            },
          });
          await handlerTx
            .update(outboxEvents)
            .set({ status: "processed", processedAt: new Date(), lastError: null })
            .where(eq(outboxEvents.id, event.id));
        });
      } catch (err) {
        const attempts = event.attempts + 1;
        const dead = attempts >= event.maxAttempts;
        await tx
          .update(outboxEvents)
          .set({
            status: dead ? "dead" : "pending",
            attempts,
            nextAttemptAt: new Date(Date.now() + 5000 * 2 ** attempts),
            lastError: String(err).slice(0, 1000),
          })
          .where(eq(outboxEvents.id, event.id));
        log("worker").warn({ id: event.id, attempts, dead }, "handler failed");
      }
    }
    return rows.length;
  });
}

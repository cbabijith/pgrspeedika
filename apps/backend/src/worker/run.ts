import "../load-env";
import { eq, sql } from "drizzle-orm";
import { outboxEvents } from "@pgrs/db";
import { createAppContext, log } from "../lib/app-context";
import { getEnv } from "../env";
import { dispatchEvent } from "./handlers";

const POLL_INTERVAL_MS = 2_000;
const BATCH_SIZE = 10;
const BASE_BACKOFF_SECONDS = 5;

/**
 * Outbox worker: polls outbox_events with FOR UPDATE SKIP LOCKED so several
 * workers can run side by side, dispatches typed handlers idempotently, and
 * retries with exponential backoff until dead-lettering.
 */
async function processBatch(ctx: ReturnType<typeof createAppContext>): Promise<number> {
  return ctx.db.transaction(async (tx) => {
    const locked = await tx.execute(
      sql`select id from outbox_events
          where status = 'pending' and next_attempt_at <= now()
          order by created_at asc
          limit ${BATCH_SIZE}
          for update skip locked`,
    );
    const rows = locked as unknown as Array<{ id: string }>;
    if (rows.length === 0) return 0;

    for (const row of rows) {
      const [event] = await tx.select().from(outboxEvents).where(eq(outboxEvents.id, row.id));
      if (!event) continue;
      try {
        await dispatchEvent(event.eventName, event.payload, ctx);
        await tx
          .update(outboxEvents)
          .set({ status: "processed", processedAt: new Date(), lastError: null })
          .where(eq(outboxEvents.id, event.id));
      } catch (err) {
        const attempts = event.attempts + 1;
        const dead = attempts >= event.maxAttempts;
        const backoffSeconds = BASE_BACKOFF_SECONDS * 2 ** attempts;
        await tx
          .update(outboxEvents)
          .set({
            status: dead ? "dead" : "pending",
            attempts,
            nextAttemptAt: new Date(Date.now() + backoffSeconds * 1000),
            lastError: String(err).slice(0, 1000),
          })
          .where(eq(outboxEvents.id, event.id));
        log("worker").warn({ id: event.id, eventName: event.eventName, attempts, dead }, "handler failed");
      }
    }
    return rows.length;
  });
}

async function main() {
  const env = getEnv();
  const ctx = createAppContext(env);
  log("worker").info({ pollMs: POLL_INTERVAL_MS }, "outbox worker started");

  let running = true;
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      running = false;
    });
  }

  while (running) {
    try {
      const processed = await processBatch(ctx);
      if (processed === 0) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
    } catch (err) {
      log("worker").error({ err: String(err) }, "batch failed; retrying");
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }
  log("worker").info("outbox worker stopped");
  process.exit(0);
}

main().catch((err) => {
  log("worker").error({ err: String(err) }, "worker crashed");
  process.exit(1);
});

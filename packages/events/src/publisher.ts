import type { Database } from "@pgrs/db";
import { outboxEvents } from "@pgrs/db";
import type { EventName, EventPayloadMap } from "./events";

/**
 * Producers depend on this interface only — swap the outbox implementation for
 * a BullMQ/Redis publisher later without touching call sites.
 */
export interface EventPublisher {
  publish<K extends EventName>(name: K, payload: EventPayloadMap[K]): Promise<void>;
}

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Transactional outbox publisher. MUST be called inside the same transaction
 * as the domain change so the event row commits or rolls back with it.
 */
export class OutboxPublisher implements EventPublisher {
  constructor(private readonly tx: Tx) {}

  async publish<K extends EventName>(name: K, payload: EventPayloadMap[K]): Promise<void> {
    await this.tx.insert(outboxEvents).values({
      eventName: name,
      payload: payload as unknown as Record<string, unknown>,
      maxAttempts: 5,
    });
  }
}

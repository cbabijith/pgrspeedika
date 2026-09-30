import { auditLogs } from "@pgrs/db";
import type { Database } from "@pgrs/db";
import type { SessionUser } from "./context";

type AuditDb = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Persist a sensitive-action audit record. Pass the transaction to commit the
 * audit row atomically with the change, or the db handle for post-commit
 * writes.
 */
export async function writeAudit(
  db: AuditDb,
  input: {
    actor: SessionUser | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    requestId?: string | null;
  },
): Promise<void> {
  await (db as Database).insert(auditLogs).values({
    actorId: input.actor?.id ?? null,
    actorRole: input.actor?.role ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    before: input.before ?? null,
    after: input.after ?? null,
    requestId: input.requestId ?? null,
  });
}

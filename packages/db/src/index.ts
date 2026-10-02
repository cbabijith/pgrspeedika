import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { schema } from "./schema";

export type Database = ReturnType<typeof createDb>;

export type DatabaseClient = ReturnType<typeof postgres>;

/**
 * Create a Drizzle instance over a new postgres.js client.
 * `prepare: false` keeps queries compatible with transaction-pooling proxies.
 */
export function createDb(connectionUrl: string, options: { max?: number } = {}) {
  const client = postgres(connectionUrl, {
    max: options.max ?? 10,
    prepare: false,
    onnotice: () => {},
  });
  return drizzle(client, { schema });
}

const globalForDb = globalThis as unknown as { __pgrsDb?: Database };

/**
 * Process-wide singleton used by the backend, worker and scripts.
 * Reads DATABASE_URL from the environment.
 */
export function getDb(): Database {
  if (globalForDb.__pgrsDb) return globalForDb.__pgrsDb;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  globalForDb.__pgrsDb = createDb(url);
  return globalForDb.__pgrsDb;
}

export { schema };
export * from "./schema";
export { applyMigrations } from "./migrate";
export { seedCatalog } from "./seed";

export { applyStorePresentation } from "./store-presentation";

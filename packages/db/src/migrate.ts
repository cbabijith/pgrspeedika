import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb } from "./index";

/** Apply all pending migrations from packages/db/migrations. */
export async function applyMigrations(connectionUrl: string): Promise<void> {
  const db = createDb(connectionUrl, { max: 1 });
  try {
    await migrate(db, { migrationsFolder: new URL("../migrations", import.meta.url).pathname });
  } finally {
    await db.$client.end();
  }
}

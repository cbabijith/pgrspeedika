import { createDb } from "@pgrs/db";
import { sql } from "drizzle-orm";

// Integration fixtures intentionally delete data; fail early on an unsafe or unavailable database.
const url = process.env.DATABASE_URL;
if (!url || !new URL(url).pathname.includes("_test")) {
  throw new Error(
    "Tests require a dedicated database whose name contains _test. Set DATABASE_URL in .env.test.",
  );
}
const db = createDb(url, { max: 1 });
try {
  await db.execute(sql`select 1`);
} finally {
  await db.$client.end();
}

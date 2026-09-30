import "./load-env";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { getDb } from "../src";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (add it to the root .env)");
  const db = getDb();
  console.log("Applying migrations from packages/db/migrations …");
  await migrate(db, { migrationsFolder: new URL("../migrations", import.meta.url).pathname });
  console.log("Migrations applied.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

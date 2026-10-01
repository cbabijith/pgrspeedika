import "./load-env";
import { applyMigrations } from "../src/migrate";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (add it to the root .env)");
  console.log("Applying migrations from packages/db/migrations …");
  await applyMigrations(url);
  console.log("Migrations applied.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

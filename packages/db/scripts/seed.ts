import "./load-env";
import { getDb } from "../src";
import { seedCatalog } from "../src/seed";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set (add it to the root .env)");
  await seedCatalog(getDb());
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

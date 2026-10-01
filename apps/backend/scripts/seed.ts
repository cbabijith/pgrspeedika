import "../src/load-env";
import { getDb } from "@pgrs/db";
import { seedAll } from "../src/seed";

async function main() {
  const ownerEmail = process.env.SEED_OWNER_EMAIL || "owner@pgrspeedika.example";
  const ownerPassword = process.env.SEED_OWNER_PASSWORD;
  if (!ownerPassword || ownerPassword.length < 10) {
    throw new Error("SEED_OWNER_PASSWORD must be set (10+ characters)");
  }
  await seedAll(getDb(), { ownerEmail, ownerPassword });
  console.log("  Password: from SEED_OWNER_PASSWORD");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

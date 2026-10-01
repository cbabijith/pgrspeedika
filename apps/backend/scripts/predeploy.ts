import "../src/load-env";
import { applyMigrations, getDb } from "@pgrs/db";
import { seedAll } from "../src/seed";

/**
 * Release step — runs as the Railway pre-deploy command (also safe by hand):
 * 1. always applies pending Drizzle migrations;
 * 2. seeds catalog + owner account when SEED_ON_DEPLOY=true (set it for the
 *    very first deploy only — the seed clears catalog tables first).
 * Everything runs in-process (no child processes).
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  console.log("Applying migrations …");
  await applyMigrations(url);
  console.log("Migrations applied.");

  if (process.env.SEED_ON_DEPLOY === "true") {
    const ownerEmail = process.env.SEED_OWNER_EMAIL || "owner@pgrspeedika.example";
    const ownerPassword = process.env.SEED_OWNER_PASSWORD;
    if (!ownerPassword || ownerPassword.length < 10) {
      throw new Error("SEED_ON_DEPLOY requires SEED_OWNER_EMAIL and SEED_OWNER_PASSWORD (10+ chars)");
    }
    console.log("SEED_ON_DEPLOY=true → seeding catalog and owner account");
    await seedAll(getDb(), { ownerEmail, ownerPassword });
    console.log("Seed complete — remove SEED_ON_DEPLOY before the next deploy to avoid reseeding.");
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

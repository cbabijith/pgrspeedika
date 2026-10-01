import "../src/load-env";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@pgrs/db";
import { createAuth } from "@pgrs/auth";
import { config } from "dotenv";

// Catalog seeding runs from packages/db; owner creation needs @pgrs/auth and
// lives here (backend depends on both packages, so no cycle).
async function main() {
  config({ path: "../../.env", quiet: true });
  const db = getDb();

  const { execSync } = await import("node:child_process");
  console.log("Seeding catalog (packages/db) …");
  execSync("pnpm --filter @pgrs/db run seed-catalog", { stdio: "inherit" });

  console.log("Creating owner account …");
  const ownerEmail = process.env.SEED_OWNER_EMAIL || "owner@pgrspeedika.example";
  const auth = createAuth({
    db,
    secret: process.env.BETTER_AUTH_SECRET ?? "",
    baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:4000",
    sendOtp: async () => {},
  });
  const result = await auth.api.signUpEmail({
    body: {
      name: "PGRS Owner",
      email: ownerEmail,
      password: process.env.SEED_OWNER_PASSWORD ?? "",
    },
  });
  const ownerUserId = result.user?.id;
  if (!ownerUserId) throw new Error("Failed to create owner account");
  await db
    .update(schema.user)
    .set({ role: "owner", emailVerified: true })
    .where(eq(schema.user.id, ownerUserId));

  console.log("Seed complete.");
  console.log(`  Owner login → email: ${ownerEmail}`);
  console.log("  Password: from SEED_OWNER_PASSWORD");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

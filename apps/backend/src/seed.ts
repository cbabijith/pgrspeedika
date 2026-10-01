import { eq } from "drizzle-orm";
import type { Database } from "@pgrs/db";
import { schema, seedCatalog } from "@pgrs/db";
import { createAuth } from "@pgrs/auth";

/**
 * Full seed: catalog (from @pgrs/db) plus the owner account created through
 * the real Better Auth signup API so the account-row shape (provider id,
 * hash format) always matches what sign-in expects.
 */
export async function seedAll(
  db: Database,
  options: { ownerEmail: string; ownerPassword: string },
): Promise<void> {
  await seedCatalog(db);

  console.log("Creating owner account …");
  const auth = createAuth({
    db,
    secret: process.env.BETTER_AUTH_SECRET ?? "",
    baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:4000",
    sendOtp: async () => {},
  });
  const result = await auth.api.signUpEmail({
    body: {
      name: "PGRS Owner",
      email: options.ownerEmail,
      password: options.ownerPassword,
    },
  });
  const ownerUserId = result.user?.id;
  if (!ownerUserId) throw new Error("Failed to create owner account");
  await db
    .update(schema.user)
    .set({ role: "owner", emailVerified: true })
    .where(eq(schema.user.id, ownerUserId));

  console.log("Seed complete.");
  console.log(`  Owner login → email: ${options.ownerEmail}`);
}

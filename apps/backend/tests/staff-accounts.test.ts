import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDb, schema, type Database } from "@pgrs/db";
import { createAuth } from "@pgrs/auth";
import { createStaffUser } from "../src/services/staff";

/**
 * Staff accounts must be able to sign in with email + password. Regression
 * test: the credential account row must carry accountId = user.id (Better
 * Auth's lookup key) — an earlier version stored the email there, which made
 * every invited staff login fail with "Invalid email or password".
 */
const dbUrl = process.env.DATABASE_URL;
const d = dbUrl ? describe : describe.skip;

let db: Database | null = null;

async function tryConnect(): Promise<boolean> {
  if (!dbUrl) return false;
  db = createDb(dbUrl, { max: 4 });
  try {
    await db.select({ key: schema.settings.key }).from(schema.settings).limit(1);
    return true;
  } catch {
    db = null;
    return false;
  }
}

d("staff accounts (integration)", () => {
  // Unique per run; password is a throwaway value for this ephemeral test row.
  const email = `staff-regression-${Date.now().toString(36)}@pgrspeedika.example`;
  const password = `Staff-Pw-${Date.now().toString(36)}`;

  beforeAll(async () => {
    await tryConnect();
  });

  afterAll(async () => {
    if (!db) return;
    await db.delete(schema.account).where(eq(schema.account.accountId, email));
    await db.delete(schema.user).where(eq(schema.user.email, email));
  });

  it("creates a staff member whose credential account uses the user id", async () => {
    const userId = await createStaffUser(db!, {
      name: "Regression Manager",
      email,
      password,
      role: "manager",
    });

    const [account] = await db!.select().from(schema.account).where(eq(schema.account.userId, userId));
    expect(account?.providerId).toBe("credential");
    expect(account?.accountId).toBe(userId); // Better Auth's lookup key

    const [created] = await db!.select().from(schema.user).where(eq(schema.user.id, userId));
    expect(created?.role).toBe("manager");
    expect(created?.emailVerified).toBe(true);
  });

  it("signs in with email + password through Better Auth", async () => {
    const auth = createAuth({
      db: db!,
      secret: process.env.BETTER_AUTH_SECRET ?? "",
      baseURL: "http://localhost:4000",
      sendOtp: async () => {},
    });
    const result = await auth.api.signInEmail({
      body: { email, password },
    });
    expect(result.user?.email.toLowerCase()).toBe(email);
    expect(result.user?.role).toBe("manager");
  });

  it("rejects duplicate staff emails", async () => {
    await expect(
      createStaffUser(db!, { name: "Dup", email, password: "Another-Pw-1234567890", role: "packer" }),
    ).rejects.toThrowError(/already exists/i);
  });
});

import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { account, user } from "@pgrs/db";
import type { Database } from "@pgrs/db";
import type { StaffRole } from "@pgrs/contracts";
import { conflict } from "../lib/errors";

export interface CreateStaffInput {
  name: string;
  email: string;
  password: string;
  role: StaffRole;
}

/**
 * Create a staff user with an email/password login. Better Auth's
 * email/password sign-in looks up the credential account by
 * `providerId = 'credential' AND accountId = user.id` — the account row MUST
 * carry the user id as accountId (not the email), or sign-in rejects with
 * "Invalid email or password".
 */
export async function createStaffUser(db: Database, input: CreateStaffInput): Promise<string> {
  const email = input.email.toLowerCase();
  const existing = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
  if (existing.length > 0) throw conflict("A user with this email already exists");

  const userId = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(user).values({
      id: userId,
      name: input.name,
      email,
      emailVerified: true,
      role: input.role,
    });
    await tx.insert(account).values({
      id: randomUUID(),
      accountId: userId,
      providerId: "credential",
      userId,
      password: await hashPassword(input.password),
    });
  });
  return userId;
}

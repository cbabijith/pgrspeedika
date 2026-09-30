import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, phoneNumber } from "better-auth/plugins";
import { schema, type Database } from "@pgrs/db";

export interface CreateAuthOptions {
  db: Database;
  secret: string;
  baseURL: string;
  /** Browser origins allowed to call auth endpoints (web + admin apps). */
  trustedOrigins?: string[];
  /** Deliver the OTP (console provider in dev, SMS/WhatsApp in production). */
  sendOtp: (data: { phoneNumber: string; code: string }) => Promise<void> | void;
}

export type PgrsAuth = ReturnType<typeof createAuth>;

/**
 * Better Auth instance used by the Hono backend.
 * - Customers sign in with phone OTP (phoneNumber plugin).
 * - Shop staff sign in with email + password; roles via the admin plugin.
 */
export function createAuth(options: CreateAuthOptions) {
  return betterAuth({
    database: drizzleAdapter(options.db, { provider: "pg", schema }),
    secret: options.secret,
    baseURL: options.baseURL,
    trustedOrigins: options.trustedOrigins ?? [],
    emailAndPassword: {
      enabled: true,
      autoSignIn: false,
      minPasswordLength: 10,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24,
      freshAge: 0,
    },
    rateLimit: {
      enabled: true,
      storage: "memory",
      window: 60,
      max: 60,
    },
    advanced: {
      useSecureCookies: process.env.NODE_ENV === "production",
      defaultCookieAttributes: {
        sameSite: "lax",
      },
    },
    user: {
      additionalFields: {
        role: {
          type: "string",
          required: false,
          defaultValue: "customer",
          input: false,
        },
      },
    },
    plugins: [
      admin({
        adminRoles: ["owner"],
        defaultRole: "customer",
      }),
      phoneNumber({
        sendOTP: options.sendOtp,
        phoneNumberValidator: (p) => /^\+91[6-9]\d{9}$/.test(p),
        otpLength: 6,
        expiresIn: 5 * 60,
      }),
    ],
  });
}

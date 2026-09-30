import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, phoneNumber } from "better-auth/plugins";
import { createAccessControl } from "better-auth/plugins/access";
import { schema, type Database } from "@pgrs/db";

/**
 * Better Auth only needs the role names registered here so sessions carry a
 * valid role. Real shop permissions (owner/manager/packer/delivery) are
 * enforced by the backend's requireStaff middleware via @pgrs/contracts.
 */
const access = createAccessControl({ shop: ["manage"] });
const shopStaffRole = () => access.newRole({ shop: ["manage"] });

export interface CreateAuthOptions {
  db: Database;
  secret: string;
  baseURL: string;
  /** Browser origins allowed to call auth endpoints (web + admin apps). */
  trustedOrigins?: string[];
  /** Deliver the OTP (console provider in dev, SMS/WhatsApp in production). */
  sendOtp: (data: { phoneNumber: string; code: string }) => Promise<void> | void;
  /** Fired after a user row is created (used to emit user.registered). */
  onUserCreated?: (user: {
    id: string;
    name: string;
    email: string | null;
    phoneNumber: string | null;
    role: string;
  }) => Promise<void> | void;
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
    databaseHooks: {
      user: {
        create: {
          after: async (newUser) => {
            if (options.onUserCreated) {
              await options.onUserCreated({
                id: newUser.id,
                name: newUser.name,
                email: newUser.email || null,
                phoneNumber: (newUser.phoneNumber as string | undefined) ?? null,
                role: (newUser.role as string | undefined) ?? "customer",
              });
            }
          },
        },
      },
    },
    plugins: [
      admin({
        adminRoles: ["owner"],
        defaultRole: "customer",
        roles: {
          owner: shopStaffRole(),
          manager: shopStaffRole(),
          packer: shopStaffRole(),
          delivery: shopStaffRole(),
          customer: access.newRole({}),
        },
      }),
      phoneNumber({
        sendOTP: options.sendOtp,
        phoneNumberValidator: (p) => /^\+91[6-9]\d{9}$/.test(p),
        otpLength: 6,
        expiresIn: 5 * 60,
        // Customers are created on first OTP verification; a per-phone temp
        // email keeps the unique index happy until they add a real one.
        signUpOnVerification: {
          getTempEmail: (phone) => `${phone}@phone.pgrspeedika.local`,
          getTempName: (phone) => `Customer ${phone.slice(-4)}`,
        },
      }),
    ],
  });
}

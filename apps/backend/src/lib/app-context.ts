import type { Database } from "@pgrs/db";
import { getDb, outboxEvents } from "@pgrs/db";
import { EVENTS } from "@pgrs/events";
import type { PgrsAuth } from "@pgrs/auth";
import { createAuth } from "@pgrs/auth";
import type { Env } from "../env";
import { getEnv } from "../env";
import { childLogger } from "./logger";
import type { NotificationProvider } from "./notify";
import { createNotificationProvider } from "./notify";

export interface AppContext {
  env: Env;
  db: Database;
  auth: PgrsAuth;
  notifier: NotificationProvider;
}

/**
 * OTP codes issued while ENABLE_TEST_OTP=true (E2E/CI only). Never populated
 * in production because the flag stays unset there.
 */
export const testOtpStore = new Map<string, string>();

export function createAppContext(env: Env = getEnv(), db: Database = getDb()): AppContext {
  const auth = createAuth({
    db,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: [env.WEB_URL, env.ADMIN_URL, ...env.CORS_ORIGINS],
    sendOtp: async ({ phoneNumber, code }) => {
      if (process.env.ENABLE_TEST_OTP === "true") {
        testOtpStore.set(phoneNumber, code);
      }
      await createNotificationProviderSingleton().send({
        channel: "sms",
        to: phoneNumber,
        title: "PGRS Peedika verification code",
        body: `${code} is your PGRS Peedika login code. It expires in 5 minutes.`,
        eventName: "otp",
      });
    },
    onUserCreated: async (user) => {
      // Emitted outside the signup transaction (Better Auth hook runs after
      // commit); the handler is idempotent so a missed/duplicated emit is safe.
      try {
        await db.insert(outboxEvents).values({
          eventName: EVENTS.userRegistered,
          payload: {
            userId: user.id,
            name: user.name,
            phone: user.phoneNumber,
            email: user.email,
            role: user.role,
          },
        });
      } catch (err) {
        childLogger({ component: "auth" }).warn({ err: String(err) }, "failed to emit user.registered");
      }
    },
  });

  let notifier: NotificationProvider | null = null;
  function createNotificationProviderSingleton(): NotificationProvider {
    if (!notifier) notifier = createNotificationProvider();
    return notifier;
  }

  return {
    env,
    db,
    auth,
    get notifier() {
      return createNotificationProviderSingleton();
    },
  };
}

export function log(component: string, bindings: Record<string, unknown> = {}) {
  return childLogger({ component, ...bindings });
}

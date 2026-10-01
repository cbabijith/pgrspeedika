import { eq } from "drizzle-orm";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  notificationPreferencesSchema,
  type NotificationPreferences,
} from "@pgrs/contracts";
import type { Database } from "@pgrs/db";
import { settings } from "@pgrs/db";

function prefsKey(userId: string): string {
  return `notifications.prefs:${userId}`;
}

/** Load a customer's notification preferences (defaults when never saved). */
export async function getNotificationPreferences(
  db: Database,
  userId: string,
): Promise<NotificationPreferences> {
  const [row] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, prefsKey(userId)));
  if (!row) return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  const parsed = notificationPreferencesSchema.safeParse(row.value);
  return parsed.success ? parsed.data : { ...DEFAULT_NOTIFICATION_PREFERENCES };
}

/** Validate and persist a customer's preferences. */
export async function saveNotificationPreferences(
  db: Database,
  userId: string,
  input: unknown,
): Promise<NotificationPreferences> {
  const parsed = notificationPreferencesSchema.safeParse(input);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid notification preferences: ${issues}`);
  }
  const prefs = parsed.data;
  await db
    .insert(settings)
    .values({ key: prefsKey(userId), value: prefs as unknown as Record<string, unknown> })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: prefs as unknown as Record<string, unknown>, updatedAt: new Date() },
    });
  return prefs;
}

/**
 * Should a message go out to this user? Order-related messages require the
 * orderUpdates flag; offers require the offers flag; every message must pass
 * its channel flag. Staff notifications (userId null) always pass.
 */
export function allowsMessage(
  prefs: NotificationPreferences,
  kind: "order" | "offer",
  channel: "sms" | "whatsapp" | "email" | "inapp",
): boolean {
  if (kind === "order" && !prefs.orderUpdates) return false;
  if (kind === "offer" && !prefs.offers) return false;
  if (channel === "sms") return prefs.sms;
  if (channel === "whatsapp") return prefs.whatsapp;
  if (channel === "email") return prefs.email;
  return true; // in-app is always allowed once the topic is enabled
}

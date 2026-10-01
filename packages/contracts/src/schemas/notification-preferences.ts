import { z } from "zod";

/**
 * Per-customer notification preferences. Order updates gate transactional
 * messages (order placed/packed/delivered, refunds); offers gate promotions.
 * Channel flags apply on top: a channel must be on for any message to use it.
 */
export const notificationPreferencesSchema = z.object({
  orderUpdates: z.boolean().default(true),
  offers: z.boolean().default(true),
  sms: z.boolean().default(true),
  whatsapp: z.boolean().default(true),
  email: z.boolean().default(true),
});
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  orderUpdates: true,
  offers: true,
  sms: true,
  whatsapp: true,
  email: true,
};

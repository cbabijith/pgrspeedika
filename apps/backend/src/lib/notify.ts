import { getEnv } from "../env";
import { childLogger } from "./logger";

export interface OutboundMessage {
  channel: "sms" | "whatsapp" | "email" | "inapp";
  to: string | null;
  title: string;
  body: string;
  eventName: string;
  relatedType?: string;
  relatedId?: string;
}

export interface NotificationProvider {
  readonly name: string;
  send(message: OutboundMessage): Promise<{ providerMessageId: string | null }>;
}

class ConsoleProvider implements NotificationProvider {
  readonly name = "console";
  async send(message: OutboundMessage) {
    childLogger({ channel: "notification" }).info(
      { to: message.to, channel: message.channel, event: message.eventName },
      `[${message.channel}] ${message.title} → ${message.to ?? "(staff)"}: ${message.body}`,
    );
    return { providerMessageId: null };
  }
}

class WebhookProvider implements NotificationProvider {
  readonly name = "webhook";
  constructor(private readonly url: string) {}

  async send(message: OutboundMessage) {
    // Only https URLs are permitted (configured via env), so no private hosts.
    if (!this.url.startsWith("https://")) {
      throw new Error("NOTIFY_WEBHOOK_URL must be https");
    }
    const parsed = new URL(this.url);
    if (
      parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "[::1]" ||
      parsed.hostname.endsWith(".local")
    ) {
      throw new Error("NOTIFY_WEBHOOK_URL must be a public https host");
    }
    const res = await fetch(parsed, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      throw new Error(`Notification webhook failed with ${res.status}`);
    }
    return { providerMessageId: null };
  }
}

export function createNotificationProvider(): NotificationProvider {
  const env = getEnv();
  if (env.NOTIFY_PROVIDER === "webhook") {
    if (!env.NOTIFY_WEBHOOK_URL) {
      throw new Error("NOTIFY_PROVIDER=webhook requires NOTIFY_WEBHOOK_URL");
    }
    return new WebhookProvider(env.NOTIFY_WEBHOOK_URL);
  }
  return new ConsoleProvider();
}

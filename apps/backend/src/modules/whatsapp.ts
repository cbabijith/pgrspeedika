import { eq } from "drizzle-orm";
import { normalizePhone } from "@pgrs/contracts";
import { settings } from "@pgrs/db";
import type { AppContext } from "../lib/app-context";
import { newHono } from "../lib/hono";
import { badRequest, ok, unauthorized } from "../lib/errors";
import { rateLimit, RATE_LIMITS } from "../lib/rate-limit";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { whatsappOrderSchema } from "@pgrs/contracts";
import { lookupCustomerByPhone, placeWhatsAppOrder, nextBookableSlot } from "../services/whatsapp-orders";
import { createHmac, timingSafeEqual } from "node:crypto";
import { parseWhatsAppOrderText } from "../services/whatsapp-parser";

async function shopWhatsApp(ctx: AppContext): Promise<string> {
  const [row] = await ctx.db.select().from(settings).where(eq(settings.key, "shop.profile"));
  const profile = row?.value as { whatsapp?: string } | undefined;
  const phone = profile?.whatsapp ?? "";
  if (!phone) throw badRequest("Shop WhatsApp number is not configured (Settings → WhatsApp)");
  return phone;
}

export function whatsappRoutes(ctx: AppContext) {
  return (
    newHono()
      /** Public shop info: WhatsApp number + next bookable delivery slot. */
      .get("/api/whatsapp/shop", async (c) => {
        const slot = await nextBookableSlot(ctx.db);
        return c.json(
          ok({
            whatsapp: await shopWhatsApp(ctx),
            nextSlot: slot ? { slotId: slot.slotId, date: slot.date, labelEn: slot.labelEn } : null,
          }),
        );
      })

      /** Saved name/addresses for a phone — prefills repeat WhatsApp orders. */
      .get(
        "/api/whatsapp/customer",
        zValidator("query", z.object({ phone: z.string() }), (result, c) => {
          if (!result.success)
            return c.json({ ok: false as const, code: "VALIDATION_ERROR", message: "phone required" }, 400);
        }),
        async (c) => {
          const raw = c.req.valid("query").phone;
          let phone: string;
          try {
            phone = normalizePhone(raw);
          } catch {
            throw badRequest("Invalid phone number");
          }
          const found = await lookupCustomerByPhone(ctx.db, phone);
          return c.json(ok(found));
        },
      )

      /** Guest order from the web cart → real order + pre-filled WhatsApp message. */
      .post(
        "/api/whatsapp/order",
        zValidator("json", whatsappOrderSchema, (result, c) => {
          if (!result.success)
            return c.json(
              {
                ok: false as const,
                code: "VALIDATION_ERROR",
                message: "Invalid order",
                details: result.error.flatten().fieldErrors,
              },
              400,
            );
        }),
        async (c) => {
          const input = c.req.valid("json");
          rateLimit(`wa-order:${c.get("ip")}:${input.customer.phone}`, RATE_LIMITS.checkout);
          const result = await placeWhatsAppOrder(
            { db: ctx.db, shopWhatsApp: () => shopWhatsApp(ctx) },
            {
              ...input,
              customer: { ...input.customer, phone: normalizePhone(input.customer.phone) },
            },
          );

          // Tell the shop immediately through the configured provider
          // (console in dev, webhook in production) and record the send.
          try {
            await ctx.notifier.send({
              channel: "whatsapp",
              to: result.shopWhatsApp,
              title: `New WhatsApp order ${result.orderNumber}`,
              body: `Open the order in the admin panel. Total ₹${(result.grandTotalPaise / 100).toFixed(2)} (COD).`,
              eventName: "order.placed",
              relatedType: "order",
              relatedId: result.orderId,
            });
          } catch {
            // Provider failures must never fail the customer's order.
          }
          return c.json(ok(result), 201);
        },
      )

      /**
       * Inbound WhatsApp webhook (Meta Cloud API payload shape).
       * GET = subscription verification; POST = message events. When
       * WHATSAPP_APP_SECRET is set the X-Hub-Signature-256 HMAC is enforced.
       */
      .get("/api/whatsapp/webhook", (c) => {
        const mode = c.req.query("hub.mode");
        const token = c.req.query("hub.verify_token");
        const challenge = c.req.query("hub.challenge") ?? "";
        const expected = process.env.WHATSAPP_VERIFY_TOKEN ?? "";
        if (!expected || mode !== "subscribe" || token !== expected) {
          return c.json({ ok: false as const, code: "FORBIDDEN", message: "Verification failed" }, 403);
        }
        return c.text(challenge);
      })
      .post("/api/whatsapp/webhook", async (c) => {
        const raw = await c.req.raw.text();
        const secret = process.env.WHATSAPP_APP_SECRET;
        if (secret) {
          const signature = c.req.header("x-hub-signature-256") ?? "";
          const expected = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
          const a = Buffer.from(signature);
          const b = Buffer.from(expected);
          if (a.length !== b.length || !timingSafeEqual(a, b)) {
            throw unauthorized("Invalid webhook signature");
          }
        }
        // Always ACK the provider; parsing problems become replies, not errors.
        let payload: unknown;
        try {
          payload = JSON.parse(raw);
        } catch {
          return c.json({ ok: true as const, data: { ignored: true } });
        }
        const handled = await handleInboundMessages(ctx, payload);
        return c.json(ok(handled));
      })
  );
}

/** Extract text messages from a Meta Cloud API webhook payload. */
interface InboundText {
  from: string;
  text: string;
  name: string | null;
}

function extractTextMessages(payload: unknown): InboundText[] {
  const root = payload as {
    entry?: Array<{
      changes?: Array<{
        value?: {
          contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
          messages?: Array<{ from?: string; text?: { body?: string }; type?: string }>;
        };
      }>;
    }>;
  };
  const out: InboundText[] = [];
  for (const entry of root.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value?.messages) continue;
      const contactName = value.contacts?.[0]?.profile?.name ?? null;
      for (const message of value.messages) {
        if (message.type === "text" && message.from && message.text?.body) {
          out.push({ from: message.from, text: message.text.body, name: contactName });
        }
      }
    }
  }
  return out;
}

async function handleInboundMessages(
  ctx: AppContext,
  payload: unknown,
): Promise<{ processed: number; ordersCreated: number; replies: number }> {
  const messages = extractTextMessages(payload);
  let ordersCreated = 0;
  let replies = 0;
  for (const message of messages) {
    let phone: string;
    try {
      phone = normalizePhone(message.from);
    } catch {
      continue;
    }
    const parsed = await parseWhatsAppOrderText(ctx.db, message.text);
    if (!parsed) {
      await reply(
        ctx,
        phone,
        "Send your order like this:\n2 kg tomato\n1 matta rice 5 kg\n\nName: Your name\nAddress: house, street\nPincode: 670001\n\nWe deliver in Kannur and Kasaragod 🥬",
      );
      replies += 1;
      continue;
    }
    try {
      const order = await placeWhatsAppOrder(
        { db: ctx.db, shopWhatsApp: () => shopWhatsApp(ctx) },
        {
          items: parsed.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
          customer: {
            name: parsed.name ?? message.name ?? "WhatsApp customer",
            phone,
            line1: parsed.address ?? "Address shared on WhatsApp",
            landmark: null,
            pincode: parsed.pincode,
            city: "Kannur",
          },
          note: message.text.length > 800 ? message.text.slice(0, 800) : message.text,
        },
      );
      ordersCreated += 1;
      await reply(
        ctx,
        phone,
        `✅ Order ${order.orderNumber} placed!\n${order.items
          .map((i) => `• ${i.nameEn} × ${i.quantity} ${i.unitLabelEn}`)
          .join(
            "\n",
          )}\nTotal ₹${(order.grandTotalPaise / 100).toFixed(2)} — cash on delivery.\nSlot: ${order.slotLabelEn} (${order.slotDate}). Thank you! 🥬`,
      );
      replies += 1;
    } catch {
      await reply(
        ctx,
        phone,
        "We could not place that order — please check the item names or use the app/website.",
      );
      replies += 1;
    }
  }
  return { processed: messages.length, ordersCreated, replies };
}

async function reply(ctx: AppContext, to: string, body: string): Promise<void> {
  try {
    await ctx.notifier.send({
      channel: "whatsapp",
      to,
      title: "PGRS Peedika",
      body,
      eventName: "whatsapp.reply",
    });
  } catch {
    // Provider failures must never fail webhook processing.
  }
}

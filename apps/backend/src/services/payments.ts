import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Env } from "../env";
import { isRazorpayConfigured } from "../env";
import { paymentFailed } from "../lib/errors";

const RAZORPAY_API = "https://api.razorpay.com/v1";

function authHeader(env: Env): string {
  const token = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString("base64");
  return `Basic ${token}`;
}

export interface ProviderOrder {
  providerOrderId: string;
  amountPaise: number;
  /** True when created locally (dev mode without Razorpay keys). */
  mock: boolean;
}

/**
 * Create an order at the payment provider. Without Razorpay credentials
 * (local dev / CI) a locally-signed mock order is created so the whole
 * checkout flow works end to end.
 */
export async function createProviderOrder(
  env: Env,
  input: { amountPaise: number; receipt: string; notes?: Record<string, string> },
): Promise<ProviderOrder> {
  if (!isRazorpayConfigured(env)) {
    return {
      providerOrderId: `mock_${randomBytes(8).toString("hex")}`,
      amountPaise: input.amountPaise,
      mock: true,
    };
  }
  const res = await fetch(`${RAZORPAY_API}/orders`, {
    method: "POST",
    headers: { authorization: authHeader(env), "content-type": "application/json" },
    body: JSON.stringify({
      amount: input.amountPaise,
      currency: "INR",
      receipt: input.receipt,
      notes: input.notes ?? {},
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw paymentFailed(`Razorpay order creation failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as { id: string; amount: number };
  return { providerOrderId: json.id, amountPaise: json.amount, mock: false };
}

/** Verify the checkout signature: HMAC-SHA256(order_id|payment_id, key_secret). */
export function verifyPaymentSignature(
  env: Env,
  razorpayOrderId: string,
  razorpayPaymentId: string,
  signature: string,
): boolean {
  if (razorpayOrderId.startsWith("mock_") && !isRazorpayConfigured(env)) {
    // Dev mock mode: signature is a digest of the mock payment id.
    const expected = createHmac("sha256", env.BETTER_AUTH_SECRET)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest("hex");
    return safeEqual(expected, signature);
  }
  if (!isRazorpayConfigured(env)) return false;
  const expected = createHmac("sha256", env.RAZORPAY_KEY_SECRET)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest("hex");
  return safeEqual(expected, signature);
}

/** Webhook payload signature over the raw body. */
export function verifyWebhookSignature(env: Env, rawBody: string, signature: string): boolean {
  if (!env.RAZORPAY_WEBHOOK_SECRET) return false;
  const expected = createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest("hex");
  return safeEqual(expected, signature);
}

/** Signature for mock payments (dev mode) so the client can complete the flow. */
export function mockPaymentSignature(env: Env, razorpayOrderId: string, razorpayPaymentId: string): string {
  return createHmac("sha256", env.BETTER_AUTH_SECRET)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest("hex");
}

export interface ProviderRefund {
  providerRefundId: string;
  mock: boolean;
}

/** Refund a captured payment (full or partial). */
export async function createProviderRefund(
  env: Env,
  providerPaymentId: string,
  amountPaise: number,
): Promise<ProviderRefund> {
  if (providerPaymentId.startsWith("mock_") || !isRazorpayConfigured(env)) {
    return { providerRefundId: `mock_rf_${randomBytes(6).toString("hex")}`, mock: true };
  }
  const res = await fetch(`${RAZORPAY_API}/payments/${encodeURIComponent(providerPaymentId)}/refund`, {
    method: "POST",
    headers: { authorization: authHeader(env), "content-type": "application/json" },
    body: JSON.stringify({ amount: amountPaise, speed: "normal" }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw paymentFailed(`Razorpay refund failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as { id: string };
  return { providerRefundId: json.id, mock: false };
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

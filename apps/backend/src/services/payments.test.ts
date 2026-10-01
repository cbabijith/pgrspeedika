import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { mockPaymentSignature, verifyPaymentSignature, verifyWebhookSignature } from "../services/payments";
import type { Env } from "../env";

/** Test env factory — every "secret" is random per run, never a real value. */
function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    NODE_ENV: "test",
    PORT: 4000,
    DATABASE_URL: "postgres://test@localhost:5432/test",
    BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
    BETTER_AUTH_URL: "http://localhost:4000",
    WEB_URL: "http://localhost:3000",
    ADMIN_URL: "http://localhost:3001",
    CORS_ORIGINS: ["http://localhost:3000"],
    LOG_LEVEL: "error",
    RAZORPAY_KEY_ID: "",
    RAZORPAY_KEY_SECRET: "",
    RAZORPAY_WEBHOOK_SECRET: randomBytes(24).toString("hex"),
    STORAGE_DRIVER: "local",
    S3_ENDPOINT: "",
    S3_REGION: "auto",
    S3_BUCKET: "",
    S3_ACCESS_KEY_ID: "",
    S3_SECRET_ACCESS_KEY: "",
    S3_PUBLIC_URL: "",
    NOTIFY_PROVIDER: "console",
    NOTIFY_WEBHOOK_URL: "",
    ...overrides,
  } as Env;
}

describe("payment signatures (mock mode)", () => {
  it("accepts a correctly signed mock payment", () => {
    const env = makeEnv();
    const orderId = `mock_${randomBytes(4).toString("hex")}`;
    const paymentId = `mock_pay_${randomBytes(4).toString("hex")}`;
    const signature = mockPaymentSignature(env, orderId, paymentId);
    expect(verifyPaymentSignature(env, orderId, paymentId, signature)).toBe(true);
  });

  it("rejects a tampered signature", () => {
    const env = makeEnv();
    const orderId = `mock_${randomBytes(4).toString("hex")}`;
    expect(verifyPaymentSignature(env, orderId, "mock_pay_x", "0".repeat(64))).toBe(false);
  });
});

describe("razorpay webhook signature", () => {
  it("verifies a valid HMAC over the raw body", async () => {
    const env = makeEnv();
    const body = JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: { id: "pay_1", order_id: "order_1" } } },
    });
    const { createHmac } = await import("node:crypto");
    const signature = createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET).update(body).digest("hex");
    expect(verifyWebhookSignature(env, body, signature)).toBe(true);
  });

  it("rejects an invalid signature", () => {
    const env = makeEnv();
    expect(verifyWebhookSignature(env, "{}", "deadbeef")).toBe(false);
  });

  it("rejects everything when no webhook secret is configured", () => {
    const env = makeEnv({ RAZORPAY_WEBHOOK_SECRET: "" });
    expect(verifyWebhookSignature(env, "{}", "anything")).toBe(false);
  });
});

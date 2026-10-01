import { Hono } from "hono";
import { cors } from "hono/cors";
import { randomUUID } from "node:crypto";
import { getEnv } from "./env";
import { createAppContext, log } from "./lib/app-context";
import type { AppContext } from "./lib/app-context";
import { errorResponse } from "./lib/errors";
import type { PgrsVariables } from "./lib/hono";
import { newHono } from "./lib/hono";
import { rateLimit, RATE_LIMITS } from "./lib/rate-limit";
import { authRoutes } from "./modules/auth";
import { healthRoutes } from "./modules/health";
import { catalogRoutes } from "./modules/catalog";
import { searchRoutes } from "./modules/search";
import { cartRoutes } from "./modules/cart";
import { checkoutRoutes } from "./modules/checkout";
import { orderRoutes } from "./modules/orders";
import { paymentRoutes } from "./modules/payments";
import { accountRoutes } from "./modules/account";
import { whatsappRoutes } from "./modules/whatsapp";
import { uploadRoutes } from "./modules/uploads";
import { adminRoutes } from "./modules/admin";

export type AppVariables = PgrsVariables;

/**
 * Compose the whole API. `AppType` is what the web/admin apps use for the
 * typed Hono RPC client (`hc<AppType>`), so route shapes are compile-time safe.
 */
export function buildApp() {
  const env = getEnv();
  const ctx = createAppContext(env);

  const app = new Hono<{ Variables: AppVariables }>();

  // Request id + structured logging for every request.
  app.use(async (c, next) => {
    const requestId = c.req.header("x-request-id") ?? randomUUID();
    c.set("requestId", requestId);
    c.set("ip", c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "local");
    c.header("x-request-id", requestId);
    const start = Date.now();
    await next();
    log("http").info(
      {
        requestId,
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        durationMs: Date.now() - start,
      },
      "request",
    );
  });

  // CORS locked to known browser origins, credentials allowed for cookies.
  app.use(
    "*",
    cors({
      origin: (origin) => (env.CORS_ORIGINS.includes(origin) ? origin : null),
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["content-type", "authorization", "x-razorpay-signature"],
      credentials: true,
      maxAge: 86400,
    }),
  );

  // Baseline per-IP rate limit (finer limits apply on auth/checkout routes).
  app.use("*", async (c, next) => {
    rateLimit(
      `ip:${c.get("ip")}:${c.req.path.startsWith("/api/auth") ? "auth" : "api"}`,
      RATE_LIMITS.default,
    );
    await next();
  });

  app.onError((err, c) => {
    const { body, status } = errorResponse(err, c.get("requestId") ?? "unknown");
    if (status >= 500) {
      log("error").error({ err, requestId: c.get("requestId") }, "unhandled error");
    }
    return c.json(body, status as 400 | 401 | 402 | 403 | 404 | 409 | 422 | 429 | 500);
  });

  const route = app
    .route("/", healthRoutes(ctx))
    .route("/", authRoutes(ctx))
    .route("/", catalogRoutes(ctx))
    .route("/", searchRoutes(ctx))
    .route("/", cartRoutes(ctx))
    .route("/", checkoutRoutes(ctx))
    .route("/", orderRoutes(ctx))
    .route("/", paymentRoutes(ctx))
    .route("/", accountRoutes(ctx))
    .route("/", whatsappRoutes(ctx))
    .route("/", uploadRoutes(ctx))
    .route("/", adminRoutes(ctx));

  return { app: route, ctx };
}

export type AppType = ReturnType<typeof buildApp>["app"];

/**
 * Smaller route groups exported purely for typed RPC clients. The full chain
 * (~90 endpoints) exceeds TypeScript's inference depth, so the storefront
 * uses PublicAppType and the admin panel uses AdminAppType. Never executed.
 */
export function buildPublicAppType(ctx: AppContext) {
  return newHono()
    .route("/", healthRoutes(ctx))
    .route("/", authRoutes(ctx))
    .route("/", catalogRoutes(ctx))
    .route("/", searchRoutes(ctx))
    .route("/", cartRoutes(ctx))
    .route("/", checkoutRoutes(ctx))
    .route("/", orderRoutes(ctx))
    .route("/", paymentRoutes(ctx))
    .route("/", accountRoutes(ctx))
    .route("/", whatsappRoutes(ctx));
}

export function buildAdminAppType(ctx: AppContext) {
  return newHono()
    .route("/", authRoutes(ctx))
    .route("/", catalogRoutes(ctx))
    .route("/", searchRoutes(ctx))
    .route("/", uploadRoutes(ctx))
    .route("/", adminRoutes(ctx));
}

export type PublicAppType = ReturnType<typeof buildPublicAppType>;
export type AdminAppType = ReturnType<typeof buildAdminAppType>;

import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import type { ZodError, ZodSchema } from "zod";

export class ApiHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiHttpError";
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new ApiHttpError(400, "VALIDATION_ERROR", message, details);
export const unauthorized = (message = "Please sign in to continue") =>
  new ApiHttpError(401, "UNAUTHORIZED", message);
export const forbidden = (message = "You do not have permission to do this") =>
  new ApiHttpError(403, "FORBIDDEN", message);
export const notFound = (message = "Not found") => new ApiHttpError(404, "NOT_FOUND", message);
export const conflict = (message: string) => new ApiHttpError(409, "CONFLICT", message);
export const outOfStock = (names: string[]) =>
  new ApiHttpError(409, "OUT_OF_STOCK", "Some items went out of stock", { items: names });
export const slotUnavailable = (message = "This delivery slot is full or closed") =>
  new ApiHttpError(409, "SLOT_UNAVAILABLE", message);
export const zoneNotServed = (message = "We do not deliver to this pincode yet") =>
  new ApiHttpError(422, "ZONE_NOT_SERVED", message);
export const minOrderNotMet = (minPaise: number) =>
  new ApiHttpError(422, "MIN_ORDER_NOT_MET", "Your cart is below this area's minimum order", {
    minOrderPaise: minPaise,
  });
export const couponInvalid = (message: string) => new ApiHttpError(422, "COUPON_INVALID", message);
export const paymentFailed = (message: string) => new ApiHttpError(402, "PAYMENT_FAILED", message);
export const rateLimited = (retryAfterSeconds: number) =>
  new ApiHttpError(429, "RATE_LIMITED", "Too many requests, please try again shortly", {
    retryAfterSeconds,
  });

/** Consistent JSON error envelope for every failure. */
export function errorResponse(err: unknown, _requestId = "") {
  if (err instanceof ApiHttpError) {
    return {
      body: { ok: false as const, code: err.code, message: err.message, details: err.details },
      status: err.status,
    };
  }
  if (err instanceof Error && err.name === "ZodError") {
    return {
      body: {
        ok: false as const,
        code: "VALIDATION_ERROR",
        message: "Invalid request",
        details: flattenZodError(err as unknown as ZodError),
      },
      status: 400,
    };
  }
  return {
    body: { ok: false as const, code: "INTERNAL", message: "Something went wrong" },
    status: 500,
  };
}

export function flattenZodError(err: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    out[issue.path.join(".") || "_"] = issue.message;
  }
  return out;
}

export function ok<T>(data: T) {
  return { ok: true as const, data };
}

/** Validate a value against a zod schema for programmatic (non-route) use. */
export function parseWith<T>(schema: ZodSchema<T>, value: unknown, message: string): T {
  const res = schema.safeParse(value);
  if (!res.success) {
    throw badRequest(message, flattenZodError(res.error));
  }
  return res.data;
}

/** Extract a cookie value whether the request is same-origin or cross-origin. */
export function readCookie(c: Context, name: string): string | undefined {
  return getCookie(c, name) ?? c.req.header(`x-${name.toLowerCase()}`);
}

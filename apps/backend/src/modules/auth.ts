import { newHono } from "../lib/hono";
import type { AppContext } from "../lib/app-context";
import { testOtpStore } from "../lib/app-context";
import { ok } from "../lib/errors";
import { getSessionUser } from "../lib/context";

export function authRoutes(ctx: AppContext) {
  return (
    newHono()
      // E2E-only helper: fetch the OTP issued to a phone. Returns 404 unless
      // ENABLE_TEST_OTP=true, so production never exposes codes. Registered
      // BEFORE the Better Auth catch-all below, which would otherwise 404 it.
      .get("/api/auth/test-otp", (c) => {
        if (process.env.ENABLE_TEST_OTP !== "true") {
          return c.json({ ok: false as const, code: "NOT_FOUND", message: "Not found" }, 404);
        }
        const phone = new URL(c.req.url).searchParams.get("phone");
        if (!phone) {
          return c.json({ ok: false as const, code: "VALIDATION_ERROR", message: "phone required" }, 400);
        }
        const code = testOtpStore.get(phone);
        if (!code) {
          return c.json({ ok: false as const, code: "NOT_FOUND", message: "No OTP issued" }, 404);
        }
        return c.json(ok({ code }));
      })
      // Better Auth owns /api/auth/* (phone OTP for customers, email/password for staff).
      .all("/api/auth/*", (c) => ctx.auth.handler(c.req.raw))
      .get("/api/me", async (c) => {
        const user = await getSessionUser(ctx, c.req.raw);
        if (!user) return c.json({ ok: false, code: "UNAUTHORIZED", message: "Not signed in" }, 401);
        return c.json(
          ok({
            id: user.id,
            name: user.name,
            email: user.email,
            phoneNumber: user.phoneNumber,
            role: user.role,
            emailVerified: user.emailVerified,
          }),
        );
      })
      .post("/api/auth/sign-out", (c) => ctx.auth.handler(c.req.raw))
  );
}

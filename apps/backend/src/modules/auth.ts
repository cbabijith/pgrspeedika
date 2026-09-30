import { newHono } from "../lib/hono";
import type { AppContext } from "../lib/app-context";
import { ok } from "../lib/errors";
import { getSessionUser } from "../lib/context";

export function authRoutes(ctx: AppContext) {
  return (
    newHono()
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

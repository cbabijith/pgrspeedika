import type { MiddlewareHandler } from "hono";
import type { AppContext } from "./app-context";
import { forbidden, unauthorized } from "./errors";
import { roleHas, type Permission, type StaffRole, type UserRole } from "@pgrs/contracts";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  phoneNumber: string | null;
  role: UserRole;
  banned: boolean;
  emailVerified: boolean;
}

/** Resolve the Better Auth session for the current request, if any. */
export async function getSessionUser(ctx: AppContext, request: Request): Promise<SessionUser | null> {
  const session = await ctx.auth.api.getSession({ headers: request.headers });
  const u = session?.user;
  if (!u) return null;
  const role = (u.role as UserRole | undefined) ?? "customer";
  return {
    id: u.id,
    name: u.name,
    email: u.email ?? "",
    phoneNumber: (u.phoneNumber as string | null) ?? null,
    role,
    banned: (u.banned as boolean | undefined) ?? false,
    emailVerified: u.emailVerified,
  };
}

/** Hono middleware: require a signed-in customer or staff member. */
export function requireAuth(ctx: AppContext): MiddlewareHandler {
  return async (c, next) => {
    const user = await getSessionUser(ctx, c.req.raw);
    if (!user) throw unauthorized();
    if (user.banned) throw forbidden("Your account has been blocked. Please contact the shop.");
    c.set("user", user);
    await next();
  };
}

/** Hono middleware: require a staff member holding a permission. */
export function requireStaff(ctx: AppContext, permission: Permission): MiddlewareHandler {
  return async (c, next) => {
    const user = await getSessionUser(ctx, c.req.raw);
    if (!user) throw unauthorized();
    const role = user.role;
    if (role === "customer" || !["owner", "manager", "packer", "delivery"].includes(role)) {
      throw forbidden("Staff access only");
    }
    if (!roleHas(role as StaffRole, permission)) {
      throw forbidden("Your role does not allow this action");
    }
    if (user.banned) throw forbidden("Your account has been blocked.");
    c.set("user", user);
    await next();
  };
}

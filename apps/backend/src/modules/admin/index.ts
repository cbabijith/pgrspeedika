import { newHono } from "../../lib/hono";
import type { AppContext } from "../../lib/app-context";
import { requireStaff } from "../../lib/context";
import { ok } from "../../lib/errors";
import { adminCatalogRoutes } from "./catalog";
import { adminOrderRoutes } from "./orders";
import { adminMarketingRoutes } from "./marketing";
import { adminPlatformRoutes } from "./platform";
import { adminReportRoutes } from "./reports";

/** Every /api/admin/* route is staff-gated; each sub-route applies its own
 *  permission on top (owner/manager/packer/delivery). */
export function adminRoutes(ctx: AppContext) {
  return newHono()
    .use("/api/admin/*", requireStaff(ctx, "orders:view"))
    .get("/api/admin", (c) => {
      const user = c.get("user");
      return c.json(ok({ staff: user.email || user.phoneNumber || user.id, role: user.role }));
    })
    .route("/api/admin", adminCatalogRoutes(ctx))
    .route("/api/admin", adminOrderRoutes(ctx))
    .route("/api/admin", adminMarketingRoutes(ctx))
    .route("/api/admin", adminPlatformRoutes(ctx))
    .route("/api/admin", adminReportRoutes(ctx));
}

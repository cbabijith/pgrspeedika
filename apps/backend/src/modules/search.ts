import { newHono } from "../lib/hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { AppContext } from "../lib/app-context";
import { ok } from "../lib/errors";
import { rateLimit, RATE_LIMITS } from "../lib/rate-limit";
import { searchSuggest } from "../services/catalog";

const suggestQuery = z.object({ q: z.string().min(1).max(120) });

export function searchRoutes(ctx: AppContext) {
  return newHono().get(
    "/api/search/suggest",
    zValidator("query", suggestQuery, (result, c) => {
      if (!result.success)
        return c.json({ ok: false as const, code: "VALIDATION_ERROR", message: "q is required" }, 400);
    }),
    (c) => {
      rateLimit(`suggest:${c.get("ip") ?? "unknown"}`, RATE_LIMITS.default);
      return c.json(ok(searchSuggest(ctx.db, c.req.valid("query").q)));
    },
  );
}

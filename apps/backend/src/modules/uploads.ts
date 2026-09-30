import { newHono } from "../lib/hono";
import { zValidator } from "@hono/zod-validator";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { uploadRequestSchema } from "@pgrs/contracts";
import type { AppContext } from "../lib/app-context";
import { notFound, ok } from "../lib/errors";
import { requireStaff } from "../lib/context";
import { log } from "../lib/app-context";

const MAX_BODY_BYTES = 10 * 1024 * 1024;
/** Keys are strictly `uploads/<date>/<uuid>.<ext>` — nothing else is accepted. */
const SAFE_KEY_PATTERN = /^uploads\/\d{4}-\d{2}-\d{2}\/[0-9a-f-]{36}\.[a-z0-9]{2,8}$/;

function safeKey(fileName: string): string {
  const ext = path
    .extname(fileName)
    .toLowerCase()
    .replace(/[^.a-z0-9]/g, "");
  return `uploads/${new Date().toISOString().slice(0, 10)}/${randomUUID()}${ext || ".bin"}`;
}

function localUploadsRoot(): string {
  return path.resolve(process.cwd(), "uploads");
}

/** Resolve a request key to an absolute path, refusing anything that could
 *  escape the uploads root (traversal, bad charset, missing boundary). */
function resolveWithinUploads(key: string): string | null {
  if (!SAFE_KEY_PATTERN.test(key)) return null;
  const root = localUploadsRoot();
  const target = path.resolve(root, key.slice("uploads/".length));
  if (target !== root && !target.startsWith(root + path.sep)) return null;
  return target;
}

export function uploadRoutes(ctx: AppContext) {
  return (
    newHono()
      // Staff-only: mint an upload target (presigned S3 PUT or local PUT URL).
      .post(
        "/api/uploads/presign",
        requireStaff(ctx, "catalog:manage"),
        zValidator("json", uploadRequestSchema, (result, c) => {
          if (!result.success)
            return c.json(
              { ok: false as const, code: "VALIDATION_ERROR", message: "Invalid upload request" },
              400,
            );
        }),
        async (c) => {
          const { fileName, contentType } = c.req.valid("json");
          const key = safeKey(fileName);

          if (ctx.env.STORAGE_DRIVER === "s3") {
            if (!ctx.env.S3_BUCKET || !ctx.env.S3_ACCESS_KEY_ID || !ctx.env.S3_SECRET_ACCESS_KEY) {
              return c.json(
                { ok: false as const, code: "INTERNAL", message: "S3 storage is not configured" },
                503,
              );
            }
            const client = new S3Client({
              region: ctx.env.S3_REGION || "auto",
              endpoint: ctx.env.S3_ENDPOINT || undefined,
              forcePathStyle: Boolean(ctx.env.S3_ENDPOINT),
              credentials: {
                accessKeyId: ctx.env.S3_ACCESS_KEY_ID,
                secretAccessKey: ctx.env.S3_SECRET_ACCESS_KEY,
              },
            });
            const command = new PutObjectCommand({
              Bucket: ctx.env.S3_BUCKET,
              Key: key,
              ContentType: contentType,
            });
            const uploadUrl = await getSignedUrl(client, command, { expiresIn: 600 });
            const publicUrl = ctx.env.S3_PUBLIC_URL
              ? `${ctx.env.S3_PUBLIC_URL.replace(/\/$/, "")}/${key}`
              : (uploadUrl.split("?")[0] ?? uploadUrl);
            return c.json(ok({ driver: "s3", key, uploadUrl, publicUrl, method: "PUT" as const }));
          }

          const origin = new URL(ctx.env.BETTER_AUTH_URL).origin;
          return c.json(
            ok({
              driver: "local",
              key,
              uploadUrl: `${origin}/uploads/${key}`,
              publicUrl: `/uploads/${key}`,
              method: "PUT" as const,
              headers: { "content-type": contentType },
            }),
          );
        },
      )
      // Local dev storage driver: accept and serve uploads from disk.
      .put("/uploads/*", async (c) => {
        const key = c.req.path.replace(/^\/uploads\//, "uploads/");
        const target = resolveWithinUploads(key);
        if (!target) {
          return c.json({ ok: false as const, code: "VALIDATION_ERROR", message: "Invalid key" }, 400);
        }
        const contentType = c.req.header("content-type") ?? "application/octet-stream";
        if (!["image/jpeg", "image/png", "image/webp", "image/svg+xml"].includes(contentType)) {
          return c.json(
            { ok: false as const, code: "VALIDATION_ERROR", message: "Unsupported content type" },
            400,
          );
        }
        const body = await c.req.raw.arrayBuffer();
        if (body.byteLength > MAX_BODY_BYTES) {
          return c.json(
            { ok: false as const, code: "VALIDATION_ERROR", message: "File too large (max 10 MB)" },
            413,
          );
        }
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, Buffer.from(body));
        log("uploads").info({ key, bytes: body.byteLength }, "stored upload");
        return c.json(ok({ key }));
      })
      .get("/uploads/*", async (c) => {
        const key = c.req.path.replace(/^\/uploads\//, "uploads/");
        const target = resolveWithinUploads(key);
        if (!target) throw notFound("Not found");
        try {
          const data = await readFile(target);
          const ext = path.extname(target).toLowerCase();
          const type =
            ext === ".png"
              ? "image/png"
              : ext === ".webp"
                ? "image/webp"
                : ext === ".svg"
                  ? "image/svg+xml"
                  : "image/jpeg";
          return new Response(new Uint8Array(data), {
            headers: { "content-type": type, "cache-control": "public, max-age=31536000, immutable" },
          });
        } catch {
          throw notFound("Upload not found");
        }
      })
  );
}

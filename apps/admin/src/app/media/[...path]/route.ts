import { NextResponse } from "next/server";
import { renderMediaSvg } from "@pgrs/ui";

export const dynamic = "force-static";

/** Deterministic SVG art for seeded catalog images (same as the web app). */
export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const [kind, ...rest] = path;
  if (!kind || rest.length === 0) {
    return new NextResponse("Not found", { status: 404 });
  }
  if (!["produce", "category", "banner"].includes(kind)) {
    return new NextResponse("Not found", { status: 404 });
  }
  const url = new URL(request.url);
  const svg = renderMediaSvg(kind as "produce" | "category" | "banner", url.searchParams);
  return new NextResponse(svg, {
    headers: {
      "content-type": "image/svg+xml",
      "cache-control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}

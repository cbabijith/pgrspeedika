import { tokens } from "@pgrs/config/tokens";

/**
 * Deterministic media SVG for seeded catalog art (produce/category/banner).
 * Each Next app serves it from /media/*; uploaded photos use real URLs.
 */
export function renderMediaSvg(kind: "produce" | "category" | "banner", params: URLSearchParams): string {
  if (kind === "banner") {
    const n = params.get("n") ?? "PGRS Peedika";
    const gradients = [
      ["#1B7A3E", "#14532D"],
      ["#2E9E58", "#1B7A3E"],
      ["#F5A623", "#1B7A3E"],
    ];
    const idx = Math.abs(hash(n)) % gradients.length;
    const [from, to] = gradients[idx] ?? gradients[0]!;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="420" viewBox="0 0 1200 420">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>
  </linearGradient></defs>
  <rect width="1200" height="420" fill="url(#g)"/>
  <circle cx="1050" cy="80" r="160" fill="#ffffff12"/>
  <circle cx="140" cy="380" r="120" fill="#ffffff0d"/>
  <text x="60" y="230" font-family="system-ui, sans-serif" font-size="58" font-weight="800" fill="#ffffff">${escapeXml(n)}</text>
  <text x="62" y="278" font-family="system-ui, sans-serif" font-size="26" fill="#ffffffcc">PGRS Peedika · Fresh from our village</text>
</svg>`;
  }

  const emoji = params.get("e") ?? "🥬";
  const name = params.get("n") ?? "";
  const hue = Math.abs(hash(name || emoji)) % 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="hsl(${hue} 45% 93%)"/>
    <stop offset="1" stop-color="hsl(${hue} 40% 86%)"/>
  </linearGradient></defs>
  <rect width="400" height="400" rx="48" fill="url(#bg)"/>
  <circle cx="200" cy="185" r="96" fill="#ffffffaa"/>
  <text x="200" y="222" text-anchor="middle" font-size="104">${escapeXml(emoji)}</text>
  ${name ? `<text x="200" y="356" text-anchor="middle" font-family="system-ui, sans-serif" font-size="24" font-weight="700" fill="${tokens.color.primaryDark}">${escapeXml(name)}</text>` : ""}
</svg>`;
}

function hash(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return h;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/**
 * PGRS Peedika design tokens — single source of truth.
 * Consumed by tailwind/theme.css (Tailwind v4 @theme) and by JS where a raw
 * color value is required (charts, PDFs, SVG generation).
 */
export const tokens = {
  color: {
    primary: "#1B7A3E",
    primaryDark: "#14532D",
    primarySurface: "#E8F5E9",
    white: "#FFFFFF",
    text: "#1F2937",
    muted: "#6B7280",
    border: "#E5E7EB",
    accent: "#F5A623",
    error: "#DC2626",
  },
} as const;

export type BrandTokens = typeof tokens;

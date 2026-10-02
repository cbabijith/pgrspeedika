import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  distDir: process.env.PGRS_NEXT_DIST_DIR ?? ".next",
  typescript: { tsconfigPath: process.env.PGRS_NEXT_TSCONFIG ?? "tsconfig.json" },
  async rewrites() {
    // Keep owner sessions on the admin origin, including on separate Railway domains.
    const backend = (
      process.env.BACKEND_URL ??
      process.env.NEXT_PUBLIC_API_URL ??
      "http://localhost:4000"
    ).replace(/\/$/, "");
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
};

export default nextConfig;

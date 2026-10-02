import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  distDir: process.env.PGRS_NEXT_DIST_DIR ?? ".next",
  typescript: { tsconfigPath: process.env.PGRS_NEXT_TSCONFIG ?? "tsconfig.json" },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "cache-control", value: "public, max-age=0, must-revalidate" },
          { key: "service-worker-allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;

import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    scope: "/",
    name: "PGRS Peedika Owner",
    short_name: "Peedika Owner",
    description: "Manage orders, products, categories, stock and prices.",
    start_url: "/orders",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#1B7A3E",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PGRS Peedika — fresh groceries delivered",
    short_name: "PGRS Peedika",
    description: "Farm-fresh vegetables and groceries from Kannur, delivered in morning and evening slots.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#1B7A3E",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}

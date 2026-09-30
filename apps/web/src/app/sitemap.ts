import type { MetadataRoute } from "next";
import { serverFetch } from "@/lib/server-api";
import type { Category } from "@pgrs/contracts";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const categories = (await serverFetch<Category[]>("/api/catalog/categories")) ?? [];

  const staticPages = [
    "",
    "/about",
    "/contact",
    "/faq",
    "/offers",
    "/privacy",
    "/refund-policy",
    "/terms",
  ].map((path) => ({
    url: `${base}${path}`,
    lastModified: new Date(),
    changeFrequency: "weekly" as const,
    priority: path === "" ? 1 : 0.5,
  }));

  const categoryPages = categories.map((c) => ({
    url: `${base}/category/${c.slug}`,
    lastModified: new Date(),
    changeFrequency: "daily" as const,
    priority: 0.8,
  }));

  return [...staticPages, ...categoryPages];
}

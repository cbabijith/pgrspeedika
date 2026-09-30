import type { Metadata } from "next";
import { serverFetch } from "@/lib/server-api";
import { HomeContent } from "@/components/home-content";
import type { Category, ProductCard } from "@pgrs/contracts";

export const metadata: Metadata = {
  title: "PGRS Peedika · Fresh vegetables & groceries delivered in Kannur",
  description:
    "Farm-fresh vegetables, fruits, rice, spices and daily groceries with morning and evening delivery slots across Kannur and Kasaragod.",
};

export const revalidate = 120;

export default async function HomePage() {
  const [feed, categories] = await Promise.all([
    serverFetch<{
      banners: Array<{
        id: string;
        titleEn: string;
        titleMl: string;
        subtitleEn: string | null;
        subtitleMl: string | null;
        imageUrl: string;
        linkUrl: string | null;
        badge: string | null;
      }>;
      freshToday: ProductCard[];
      bestSellers: ProductCard[];
      seasonal: ProductCard[];
    }>("/api/catalog/home"),
    serverFetch<Category[]>("/api/catalog/categories"),
  ]);

  return (
    <HomeContent
      banners={feed?.banners ?? []}
      categories={categories ?? []}
      freshToday={feed?.freshToday ?? []}
      bestSellers={feed?.bestSellers ?? []}
      seasonal={feed?.seasonal ?? []}
    />
  );
}

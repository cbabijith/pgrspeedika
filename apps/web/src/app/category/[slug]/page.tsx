import { Suspense } from "react";
import type { Metadata } from "next";
import { CatalogBrowser } from "@/components/catalog-browser";
import { serverFetch } from "@/lib/server-api";
import type { Category } from "@pgrs/contracts";

export const revalidate = 300;

export async function generateStaticParams() {
  const categories = await serverFetch<Category[]>("/api/catalog/categories");
  return (categories ?? []).map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const categories = await serverFetch<Category[]>("/api/catalog/categories");
  const category = (categories ?? []).find((c) => c.slug === slug);
  return {
    title: category ? `${category.nameEn} delivery` : "Category",
    description:
      category?.description ??
      `Fresh ${category?.nameEn ?? "products"} from PGRS Peedika, delivered to your door.`,
  };
}

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const categories = await serverFetch<Category[]>("/api/catalog/categories");
  const category = (categories ?? []).find((c) => c.slug === slug);
  return (
    <Suspense>
      <CatalogBrowser
        title={category ? `${category.nameEn} / ${category.nameMl}` : "Category"}
        subtitle={category?.description ?? undefined}
        baseQuery={{ categorySlug: slug }}
      />
    </Suspense>
  );
}

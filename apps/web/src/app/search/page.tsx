import { Suspense } from "react";
import type { Metadata } from "next";
import { CatalogBrowser } from "@/components/catalog-browser";

export const metadata: Metadata = {
  title: "Search",
  robots: { index: false },
};

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  return (
    <Suspense>
      <CatalogBrowser
        title={q ? `Results for “${q}”` : "Search"}
        subtitle="English അല്ലെങ്കിൽ മലയാളം — both work."
        baseQuery={{ q }}
      />
    </Suspense>
  );
}

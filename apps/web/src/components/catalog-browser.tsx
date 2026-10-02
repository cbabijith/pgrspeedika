"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button, EmptyState, Select, Skeleton } from "@pgrs/ui";
import type { Category, ListProductsQuery, Paginated, ProductCard as ProductCardData } from "@pgrs/contracts";
import { api, unwrap } from "@/lib/api";
import { useUIStore } from "@/store/ui";
import { ProductCard } from "./product-card";

/** Shared catalog browser: filters, sort, and a load-more list. */
export function CatalogBrowser({
  title,
  subtitle,
  baseQuery,
}: {
  title: string;
  subtitle?: string;
  baseQuery: { categorySlug?: string; q?: string };
}) {
  const lang = useUIStore((s) => s.lang);
  const t = (en: string, ml: string) => (lang === "en" ? en : ml);
  const router = useRouter();
  const searchParams = useSearchParams();

  const [sort, setSort] = useState<ListProductsQuery["sort"]>("popular");
  const [inStock, setInStock] = useState(false);
  const [freshOnly, setFreshOnly] = useState(searchParams.get("fresh") === "1");
  const filters = {
    ...baseQuery,
    sort,
    ...(inStock ? { inStock: true } : {}),
    ...(freshOnly ? { freshToday: true } : {}),
  };
  const catalog = useInfiniteQuery({
    queryKey: ["products", filters],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      unwrap<Paginated<ProductCardData>>(
        api.api.catalog.products.$get({ query: { ...filters, page: pageParam, pageSize: 20 } }),
      ),
    getNextPageParam: (last) => (last.page < last.pageCount ? last.page + 1 : undefined),
  });
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => unwrap<Category[]>(api.api.catalog.categories.$get()),
  });
  const items = catalog.data?.pages.flatMap((page) => page.items) ?? [];
  const isLoading = catalog.isLoading;
  const hasMore = catalog.hasNextPage;

  return (
    <div className="container-page space-y-5 py-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">{title}</h1>
        {subtitle ? <p className="text-sm text-muted">{subtitle}</p> : null}
      </header>

      <nav aria-label="Shop categories" className="flex gap-2 overflow-x-auto pb-2">
        {[{ slug: "", nameEn: "All items", nameMl: "എല്ലാ ഇനങ്ങളും" }, ...(categories.data ?? [])].map(
          (c) => (
            <Link
              key={c.slug}
              href={c.slug ? `/category/${c.slug}` : "/shop"}
              aria-current={c.slug === (baseQuery.categorySlug ?? "") ? "page" : undefined}
              className={`flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-bold ${c.slug === (baseQuery.categorySlug ?? "") ? "border-primary bg-primary text-white" : "border-line bg-white text-ink"}`}
            >
              {lang === "en" ? c.nameEn : c.nameMl}
            </Link>
          ),
        )}
      </nav>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filters">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-muted">
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
          {t("Filters", "ഫിൽട്ടറുകൾ")}
        </span>
        <button
          type="button"
          aria-pressed={inStock}
          onClick={() => setInStock((v) => !v)}
          className={
            inStock
              ? "min-h-11 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-white"
              : "min-h-11 rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-muted hover:border-primary-300"
          }
        >
          {t("In stock", "ലഭ്യമുള്ളത്")}
        </button>
        <button
          type="button"
          aria-pressed={freshOnly}
          onClick={() => setFreshOnly((v) => !v)}
          className={
            freshOnly
              ? "min-h-11 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-white"
              : "min-h-11 rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-muted hover:border-primary-300"
          }
        >
          🌱 {t("Fresh today", "ഇന്നത്തെ പുത്തൻ")}
        </button>
        <div className="ml-auto flex items-center gap-2">
          <label htmlFor="sort" className="text-xs font-bold text-muted">
            {t("Sort", "ക്രമം")}
          </label>
          <Select
            id="sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as ListProductsQuery["sort"])}
            className="w-40 py-1.5 text-xs"
          >
            <option value="popular">{t("Popular", "പ്രിയപ്പെട്ടത്")}</option>
            <option value="price_asc">{t("Price: low to high", "വില: കുറഞ്ഞത് മുതൽ")}</option>
            <option value="price_desc">{t("Price: high to low", "വില: കൂടിയത് മുതൽ")}</option>
            <option value="name_asc">{t("Name A–Z", "പേര് A–Z")}</option>
            <option value="name_desc">{t("Name Z–A", "പേര് Z–A")}</option>
          </Select>
        </div>
      </div>

      {catalog.error ? (
        <div role="alert" className="rounded-xl border border-line bg-white p-4 text-sm">
          <p>{catalog.error.message}</p>
          <Button variant="outline" onClick={() => catalog.refetch()}>
            Try again
          </Button>
        </div>
      ) : null}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[3/4]" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title={t("Nothing found", "ഒന്നും കിട്ടിയില്ല")}
          description={t(
            "Try clearing filters or searching for something else.",
            "ഫിൽട്ടറുകൾ മാറ്റി വീണ്ടും ശ്രമിക്കുക.",
          )}
          action={
            <Button variant="outline" onClick={() => router.push("/")}>
              {t("Go home", "ഹോം")}
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {items.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
          {hasMore ? (
            <div className="flex justify-center">
              <Button
                variant="outline"
                loading={catalog.isFetchingNextPage}
                onClick={() => catalog.fetchNextPage()}
              >
                {t("Load more", "കൂടുതൽ കാണുക")}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

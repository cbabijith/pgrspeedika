"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button, EmptyState, Select, Skeleton } from "@pgrs/ui";
import type { ListProductsQuery, Paginated, ProductCard as ProductCardData } from "@pgrs/contracts";
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
  const [freshOnly, setFreshOnly] = useState(false);
  const [page, setPage] = useState(1);

  const query = new URLSearchParams();
  if (baseQuery.categorySlug) query.set("categorySlug", baseQuery.categorySlug);
  if (baseQuery.q) query.set("q", baseQuery.q);
  query.set("sort", sort);
  if (inStock) query.set("inStock", "true");
  if (freshOnly) query.set("freshToday", "true");
  query.set("page", String(page));
  query.set("pageSize", "20");

  // Reset paging whenever the query shape changes.
  useEffect(() => {
    setPage(1);
  }, [sort, inStock, freshOnly, baseQuery.categorySlug, baseQuery.q]);

  const { data, isLoading } = useQuery({
    queryKey: ["products", query.toString()],
    queryFn: () =>
      unwrap<Paginated<ProductCardData>>(api.api.catalog.products.$get({ query: query as never })),
  });

  const items = data?.items ?? [];
  const hasMore = data ? data.page < data.pageCount : false;

  return (
    <div className="container-page space-y-5 py-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">{title}</h1>
        {subtitle ? <p className="text-sm text-muted">{subtitle}</p> : null}
      </header>

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
              ? "rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-white"
              : "rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-muted hover:border-primary-300"
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
              ? "rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-white"
              : "rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-muted hover:border-primary-300"
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
              <Button variant="outline" onClick={() => setPage((p) => p + 1)}>
                {t("Load more", "കൂടുതൽ കാണുക")}
              </Button>
            </div>
          ) : null}
        </>
      )}
      <p className="sr-only">{searchParams.toString()}</p>
    </div>
  );
}

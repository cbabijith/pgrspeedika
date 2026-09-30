"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Check } from "lucide-react";
import { Badge, Money } from "@pgrs/ui";
import type { ProductCard as ProductCardData } from "@pgrs/contracts";
import { useCartActions } from "@/lib/hooks";
import { useUIStore } from "@/store/ui";

/** Storefront product card: variant chips + quick add, bilingual names. */
export function ProductCard({ product }: { product: ProductCardData }) {
  const lang = useUIStore((s) => s.lang);
  const setCartOpen = useUIStore((s) => s.setCartOpen);
  const actions = useCartActions();
  const [variantId, setVariantId] = useState(product.variants[0]?.id ?? "");
  const [added, setAdded] = useState(false);

  const variant = product.variants.find((v) => v.id === variantId) ?? product.variants[0];
  const soldOut = variant != null && product.availableQuantity != null && product.availableQuantity <= 0;

  function add() {
    if (!variant) return;
    actions.add.mutate(
      { variantId: variant.id, quantity: 1 },
      {
        onSuccess: () => {
          setAdded(true);
          setTimeout(() => setAdded(false), 1200);
          setCartOpen(true);
        },
        onError: (err) => toast.error(err.message),
      },
    );
  }

  return (
    <article className="group flex flex-col overflow-hidden rounded-card border border-line bg-white shadow-card transition-shadow hover:shadow-lift">
      <Link
        href={`/products/${product.slug}`}
        className="relative block aspect-square overflow-hidden bg-primary-50"
        aria-label={lang === "en" ? product.nameEn : product.nameMl}
      >
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={`${product.nameEn} (${product.nameMl})`}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : null}
        {product.isFreshToday ? (
          <Badge tone="green" className="absolute left-2 top-2 bg-white/95">
            🌱 {lang === "en" ? "Fresh today" : "ഇന്നത്തെ പുത്തൻ"}
          </Badge>
        ) : null}
        {soldOut ? (
          <span className="absolute inset-0 flex items-center justify-center bg-white/70 text-sm font-bold text-danger">
            {lang === "en" ? "Out of stock" : "ലഭ്യമല്ല"}
          </span>
        ) : null}
      </Link>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex-1">
          <Link href={`/products/${product.slug}`} className="block">
            <h3 className="truncate text-sm font-bold text-ink">
              {lang === "en" ? product.nameEn : product.nameMl}
            </h3>
          </Link>
          <p className="mt-0.5 text-xs text-muted">
            {product.ratingCount > 0
              ? `★ ${product.ratingAvg.toFixed(1)} (${product.ratingCount})`
              : lang === "en"
                ? "New at our shop"
                : "പുതിയത്"}
          </p>
        </div>

        {product.variants.length > 1 ? (
          <div className="flex flex-wrap gap-1" role="group" aria-label="Choose pack size">
            {product.variants.slice(0, 4).map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setVariantId(v.id)}
                aria-pressed={v.id === variantId}
                className={
                  v.id === variantId
                    ? "rounded-full bg-primary px-2.5 py-1 text-[11px] font-bold text-white"
                    : "rounded-full border border-line px-2.5 py-1 text-[11px] font-semibold text-muted hover:border-primary-300"
                }
              >
                {lang === "en" ? v.labelEn : v.labelMl}
              </button>
            ))}
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-col">
            <Money paise={variant?.pricePaise ?? 0} className="text-base font-extrabold text-primary-700" />
            {variant?.mrpPaise && variant.mrpPaise > variant.pricePaise ? (
              <Money paise={variant.mrpPaise} strike className="text-[11px]" />
            ) : null}
          </div>
          <button
            type="button"
            onClick={add}
            disabled={soldOut || actions.add.isPending}
            aria-label={`Add ${product.nameEn} ${variant?.labelEn ?? ""} to cart`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary text-white transition-colors hover:bg-primary-600 disabled:opacity-40"
          >
            {added ? <Check className="h-4 w-4" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
          </button>
        </div>
      </div>
    </article>
  );
}

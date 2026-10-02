"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Badge, Money, QuantityStepper } from "@pgrs/ui";
import type { ProductCard as ProductCardData } from "@pgrs/contracts";
import { useCart, useCartActions } from "@/lib/hooks";
import { useCartStore } from "@/store/cart";
import { useUIStore } from "@/store/ui";

/** Select several products without leaving the grid; quantities share the actual basket. */
export function ProductCard({ product }: { product: ProductCardData }) {
  const lang = useUIStore((s) => s.lang);
  const pincode = useUIStore((s) => s.pincode);
  const { cart, signedIn } = useCart(pincode);
  const localLines = useCartStore((s) => s.lines);
  const lines = signedIn ? (cart?.items ?? []) : localLines;
  const actions = useCartActions();
  const [variantId, setVariantId] = useState(product.variants[0]?.id ?? "");
  const variant = product.variants.find((v) => v.id === variantId) ?? product.variants[0];
  const quantity = lines.find((line) => line.variantId === variant?.id)?.quantity ?? 0;
  const otherStock = product.variants.reduce((sum, v) => {
    if (v.id === variant?.id) return sum;
    const count = lines.find((line) => line.variantId === v.id)?.quantity ?? 0;
    return sum + count * (product.sellingType === "loose" ? v.baseQuantity : 1);
  }, 0);
  const max =
    variant && product.availableQuantity != null
      ? Math.max(
          0,
          Math.min(
            99,
            Math.floor(
              (product.availableQuantity - otherStock) /
                (product.sellingType === "loose" ? variant.baseQuantity : 1),
            ),
          ),
        )
      : 99;
  const busy = actions.add.isPending || actions.setQuantity.isPending;
  function change(next: number) {
    if (!variant) return;
    const input = { variantId: variant.id, quantity: next };
    const options = { onError: (err: Error) => toast.error(err.message) };
    if (quantity === 0) actions.add.mutate(input, options);
    else actions.setQuantity.mutate(input, options);
  }
  return (
    <article
      aria-label={product.nameEn}
      className="group flex min-w-0 flex-col overflow-hidden rounded-card border border-line bg-white shadow-card transition-shadow hover:shadow-lift"
    >
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
            🌱 {lang === "en" ? "Fresh" : "പുത്തൻ"}
          </Badge>
        ) : null}
        {max === 0 && quantity === 0 ? (
          <span className="absolute inset-0 flex items-center justify-center bg-white/70 text-sm font-bold text-danger">
            {lang === "en" ? "Out of stock" : "ലഭ്യമല്ല"}
          </span>
        ) : null}
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-2.5 sm:p-3">
        <Link href={`/products/${product.slug}`}>
          <h3 className="min-h-10 break-words text-sm font-bold leading-5 text-ink">
            {lang === "en" ? product.nameEn : product.nameMl}
          </h3>
        </Link>
        {product.variants.length > 1 ? (
          <select
            aria-label={`Pack size for ${product.nameEn}`}
            value={variant?.id}
            onChange={(e) => setVariantId(e.target.value)}
            className="h-11 w-full min-w-0 rounded-lg border border-line bg-surface-muted px-2 text-base font-semibold sm:text-sm"
          >
            {product.variants.map((v) => (
              <option key={v.id} value={v.id}>
                {lang === "en" ? v.labelEn : v.labelMl}
              </option>
            ))}
          </select>
        ) : (
          <p className="flex h-11 items-center text-sm text-muted">
            {lang === "en" ? variant?.labelEn : variant?.labelMl}
          </p>
        )}
        <div className="mt-auto flex flex-wrap items-baseline gap-1.5">
          <Money paise={variant?.pricePaise ?? 0} className="text-base font-extrabold text-primary-700" />
          {variant?.mrpPaise && variant.mrpPaise > variant.pricePaise ? (
            <Money paise={variant.mrpPaise} strike className="text-xs" />
          ) : null}
        </div>
        {quantity > 0 ? (
          <QuantityStepper
            value={quantity}
            min={0}
            max={max}
            disabled={busy}
            onChange={change}
            ariaLabel={`Quantity for ${product.nameEn} ${variant?.labelEn}`}
            className="w-full justify-between"
          />
        ) : (
          <button
            type="button"
            onClick={() => change(1)}
            disabled={!variant || max === 0 || busy}
            aria-label={`Add ${product.nameEn} ${variant?.labelEn ?? ""} to cart`}
            className="flex h-11 w-full items-center justify-center gap-1 rounded-xl border border-primary bg-primary-surface text-sm font-bold text-primary-700 disabled:opacity-40"
          >
            <Plus className="h-4 w-4" aria-hidden /> {lang === "en" ? "Add" : "ചേർക്കുക"}
          </button>
        )}
      </div>
    </article>
  );
}

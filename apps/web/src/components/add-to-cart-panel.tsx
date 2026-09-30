"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Badge, Button, Money, QuantityStepper } from "@pgrs/ui";
import { formatGrams } from "@pgrs/contracts";
import type { ProductDetail } from "@pgrs/contracts";
import { useCartActions } from "@/lib/hooks";
import { useUIStore } from "@/store/ui";

/** Variant selector + quantity + add-to-cart panel on the product page. */
export function AddToCartPanel({ product }: { product: ProductDetail }) {
  const lang = useUIStore((s) => s.lang);
  const setCartOpen = useUIStore((s) => s.setCartOpen);
  const actions = useCartActions();
  const [variantId, setVariantId] = useState(product.variants[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);

  const variant = product.variants.find((v) => v.id === variantId) ?? product.variants[0];
  const soldOut =
    product.availableQuantity != null && product.availableQuantity < (variant?.baseQuantity ?? 1) * quantity;
  const t = (en: string, ml: string) => (lang === "en" ? en : ml);

  function add() {
    if (!variant) return;
    actions.add.mutate(
      { variantId: variant.id, quantity },
      {
        onSuccess: () => {
          toast.success(t("Added to cart", "കൊട്ടയിൽ ചേർത്തു"));
          setCartOpen(true);
        },
        onError: (err) => toast.error(err.message),
      },
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-2">
        <Money paise={variant?.pricePaise ?? 0} className="text-3xl font-extrabold text-primary-700" />
        {variant?.mrpPaise && variant.mrpPaise > variant.pricePaise ? (
          <>
            <Money paise={variant.mrpPaise} strike className="text-sm" />
            <Badge tone="amber">
              {t("Save", "ലാഭ")} <Money paise={variant.mrpPaise - variant.pricePaise} />
            </Badge>
          </>
        ) : null}
        <span className="text-xs text-muted">
          {variant ? (lang === "en" ? `per ${variant.labelEn}` : `${variant.labelMl} ന്`) : ""}
        </span>
      </div>

      <div>
        <p className="mb-2 text-sm font-bold text-ink">{t("Choose pack", "പായ്ക്ക് തിരഞ്ഞെടുക്കുക")}</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Pack size">
          {product.variants.map((v) => (
            <button
              key={v.id}
              type="button"
              aria-pressed={v.id === variantId}
              onClick={() => setVariantId(v.id)}
              className={
                v.id === variantId
                  ? "rounded-full border-2 border-primary bg-primary-surface px-4 py-2 text-sm font-bold text-primary-700"
                  : "rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink hover:border-primary-300"
              }
            >
              {lang === "en" ? v.labelEn : v.labelMl} · <Money paise={v.pricePaise} />
            </button>
          ))}
        </div>
        {product.sellingType === "loose" && variant ? (
          <p className="mt-1.5 text-xs text-muted">
            {t(
              `Priced per kg — sold in ${(variant.stepQuantity / 1000).toFixed(2).replace(/\.?0+$/, "")} kg steps`,
              `കിലോയ്ക്ക് വില — ${formatGrams(variant.stepQuantity, "ml")} സ്റ്റെപ്പുകളിൽ`,
            )}
          </p>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        <QuantityStepper value={quantity} onChange={setQuantity} ariaLabel="Quantity" />
        <Button size="lg" className="flex-1" onClick={add} disabled={soldOut} loading={actions.add.isPending}>
          {soldOut ? t("Not enough stock", "സ്റ്റോക്ക് ഇല്ല") : t("Add to cart", "കൊട്ടയിൽ ചേർക്കുക")}
        </Button>
      </div>

      {product.availableQuantity != null && product.availableQuantity > 0 ? (
        <p className="text-xs text-muted">
          {product.lowStock ? t("Hurry, low stock!", "വേഗം ചെയ്യൂ — കുറവാണ്!") : t("In stock", "ലഭ്യമാണ്")}
        </p>
      ) : product.availableQuantity === 0 ? (
        <p className="text-xs font-bold text-danger">{t("Out of stock", "ലഭ്യമല്ല")}</p>
      ) : null}
    </div>
  );
}

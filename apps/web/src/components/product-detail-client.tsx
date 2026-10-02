"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Heart } from "lucide-react";
import { Badge, Money } from "@pgrs/ui";
import { formatGrams } from "@pgrs/contracts";
import type { ProductCard, ProductDetail } from "@pgrs/contracts";
import { api, unwrap } from "@/lib/api";
import { useSession } from "@/lib/hooks";
import { useUIStore } from "@/store/ui";
import { AddToCartPanel } from "./add-to-cart-panel";
import { ProductCard as ProductCardView } from "./product-card";
import { ReviewSection } from "./review-section";

export function ProductDetailClient({
  product,
  related,
}: {
  product: ProductDetail;
  related: ProductCard[];
}) {
  const lang = useUIStore((s) => s.lang);
  const session = useSession();
  const user = session.data?.user ?? null;
  const queryClient = useQueryClient();
  const [image] = useState(product.images[0]?.url ?? product.imageUrl ?? null);
  const t = (en: string, ml: string) => (lang === "en" ? en : ml);

  const wishlist = useQuery({
    queryKey: ["wishlist"],
    enabled: Boolean(user),
    queryFn: () => unwrap<Array<{ productId: string }>>(api.api.wishlist.$get({ query: {} })),
  });
  const wishlisted = (wishlist.data ?? []).some((w) => w.productId === product.id);

  const toggleWishlist = useMutation({
    mutationFn: () =>
      unwrap<{ wishlisted: boolean }>(api.api.wishlist.toggle.$post({ json: { productId: product.id } })),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["wishlist"] });
      toast.success(
        data.wishlisted
          ? t("Saved to wishlist", "വിഷ്ലിസ്റ്റിൽ സേവ് ചെയ്തു")
          : t("Removed from wishlist", "വിഷ്ലിസ്റ്റിൽ നിന്ന് നീക്കി"),
      );
    },
    onError: (err) => {
      if (err.message.toLowerCase().includes("sign in")) {
        window.location.href = `/login?next=/products/${product.slug}`;
        return;
      }
      toast.error(err.message);
    },
  });

  return (
    <div className="container-page space-y-10 py-6">
      <div className="grid gap-8 md:grid-cols-2">
        <div className="overflow-hidden rounded-card border border-line bg-white shadow-card">
          {image ? (
            <img src={image} alt={product.nameEn} className="aspect-square w-full object-cover" />
          ) : null}
        </div>

        <div className="space-y-5">
          <div>
            <div className="mb-2 flex flex-wrap gap-2">
              {product.isFreshToday ? (
                <Badge tone="green">🌱 {t("Fresh today", "ഇന്നത്തെ പുത്തൻ")}</Badge>
              ) : null}
              {product.brand ? <Badge tone="outline">{product.brand}</Badge> : null}
              <Badge tone="outline">
                GST {product.gstRate}%{product.hsnCode ? ` · HSN ${product.hsnCode}` : ""}
              </Badge>
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-ink">
              {lang === "en" ? product.nameEn : product.nameMl}
            </h1>
            <p className="text-sm text-muted">
              {lang === "en" ? product.nameMl : product.nameEn}
              {product.ratingCount > 0
                ? ` · ★ ${product.ratingAvg.toFixed(1)} (${product.ratingCount} ${t("reviews", "റിവ്യൂ")})`
                : ""}
            </p>
          </div>

          <div className="flex items-start justify-between gap-3">
            <AddToCartPanel product={product} />
            <p className="text-xs text-muted">
              Product photos are representative; varieties and packaging may differ.
            </p>
            <button
              type="button"
              onClick={() => toggleWishlist.mutate()}
              aria-pressed={wishlisted}
              aria-label={
                wishlisted
                  ? t("Remove from wishlist", "വിഷ്ലിസ്റ്റിൽ നിന്ന് നീക്കുക")
                  : t("Save to wishlist", "വിഷ്ലിസ്റ്റിൽ സേവ് ചെയ്യുക")
              }
              className="mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line hover:border-primary-300"
            >
              <Heart
                className={wishlisted ? "h-5 w-5 fill-primary text-primary" : "h-5 w-5 text-muted"}
                aria-hidden
              />
            </button>
          </div>

          {product.description ? (
            <div>
              <h2 className="mb-1 text-sm font-bold text-ink">
                {t("About this item", "ഈ ഇനത്തെക്കുറിച്ച്")}
              </h2>
              <p className="text-sm leading-relaxed text-muted">{product.description}</p>
            </div>
          ) : null}

          <dl className="grid grid-cols-2 gap-3 rounded-card bg-primary-50 p-4 text-xs">
            <div>
              <dt className="font-bold text-primary-800">{t("Sold as", "വിൽക്കുന്നത്")}</dt>
              <dd className="text-primary-700">
                {product.sellingType === "loose"
                  ? t("loose, weighed at packing", "അളവിൽ, പായ്ക്കിംഗ് സമയത്ത് തൂക്കും")
                  : t("sealed pack", "സീൽ ചെയ്ത പായ്ക്ക്")}
              </dd>
            </div>
            <div>
              <dt className="font-bold text-primary-800">{t("Bill accuracy", "ബിൽ കൃത്യത")}</dt>
              <dd className="text-primary-700">
                {t("You pay for the actual packed weight", "യഥാർത്ഥ തൂക്കത്തിന് മാത്രം പണം")}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {related.length > 0 ? (
        <section aria-labelledby="related" className="space-y-4">
          <h2 id="related" className="section-title">
            {t("Customers also bought", "മറ്റുള്ളവർ വാങ്ങിയത്")}
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {related.slice(0, 5).map((p) => (
              <ProductCardView key={p.id} product={p} />
            ))}
          </div>
        </section>
      ) : null}

      <ReviewSection productId={product.id} productSlug={product.slug} />

      <p className="text-center text-xs text-muted">
        {product.sellingType === "loose"
          ? t(
              `Prices per kg; e.g. ${formatGrams(500)} for half a kilo.`,
              `കിലോയ്ക്കുള്ള വില; ഉദാ: ${formatGrams(500, "ml")} പകുതി കിലോയ്ക്ക്.`,
            )
          : null}{" "}
        <Money paise={0} className="hidden" />
      </p>
    </div>
  );
}

"use client";

import { useUIStore } from "@/store/ui";
import { BannerCarousel, type BannerItem } from "./banner-carousel";
import { ProductCard } from "./product-card";
import type { ProductCard as ProductCardData, Category } from "@pgrs/contracts";
import Link from "next/link";
import { ArrowRight, Clock, Leaf, ShieldCheck, Truck } from "lucide-react";

export function ProductRail({
  title,
  subtitle,
  products,
  href,
}: {
  title: string;
  subtitle?: string;
  products: ProductCardData[];
  href?: string;
}) {
  if (products.length === 0) return null;
  return (
    <section aria-labelledby={`rail-${title.replace(/\s/g, "-")}`} className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 id={`rail-${title.replace(/\s/g, "-")}`} className="section-title">
            {title}
          </h2>
          {subtitle ? <p className="text-sm text-muted">{subtitle}</p> : null}
        </div>
        {href ? (
          <Link
            href={href}
            className="inline-flex items-center gap-1 text-sm font-bold text-primary-700 hover:underline"
          >
            View all <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {products.slice(0, 10).map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  );
}

export function HomeContent({
  banners,
  categories,
  freshToday,
  bestSellers,
  seasonal,
}: {
  banners: BannerItem[];
  categories: Category[];
  freshToday: ProductCardData[];
  bestSellers: ProductCardData[];
  seasonal: ProductCardData[];
}) {
  const lang = useUIStore((s) => s.lang);
  const t = (en: string, ml: string) => (lang === "en" ? en : ml);

  return (
    <div className="container-page space-y-10 py-6">
      <BannerCarousel banners={banners} lang={lang} />

      <section aria-labelledby="categories" className="space-y-4">
        <h2 id="categories" className="section-title">
          {t("Shop by category", "വിഭാഗം അനുസരിച്ച്")}
        </h2>
        <div className="grid grid-cols-4 gap-3 md:grid-cols-8">
          {categories.map((category) => (
            <Link
              key={category.id}
              href={`/category/${category.slug}`}
              className="group flex flex-col items-center gap-2 rounded-card border border-line bg-white p-3 text-center shadow-card transition-shadow hover:shadow-lift"
            >
              <span className="overflow-hidden rounded-xl">
                {category.imageUrl ? (
                  <img
                    src={category.imageUrl}
                    alt=""
                    loading="lazy"
                    className="h-14 w-14 object-cover transition-transform group-hover:scale-110"
                  />
                ) : null}
              </span>
              <span className="text-xs font-bold text-ink">
                {lang === "en" ? category.nameEn : category.nameMl}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <ProductRail
        title={t("Fresh today", "ഇന്നത്തെ പുത്തൻ")}
        subtitle={t("Cut and stocked this morning", "ഇന്ന് രാവിലെ എത്തിയവ")}
        products={freshToday}
        href="/search?q=fresh"
      />

      <section aria-label="Why shop with us" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          {
            icon: <Leaf className="h-6 w-6" aria-hidden />,
            title: t("Farm fresh daily", "ദിവസവും പുത്തൻ"),
            body: t("We buy from local farmers every morning.", "ദിവസവും പ്രാദേശിക കർഷകരിൽ നിന്ന്."),
          },
          {
            icon: <Clock className="h-6 w-6" aria-hidden />,
            title: t("On-time slots", "സമയക്രമീകൃത ഡെലിവറി"),
            body: t("Morning 7–9 AM and evening 5–7 PM slots.", "രാവിലെ 7–9, വൈകുന്നേരം 5–7 സ്ലോട്ടുകൾ."),
          },
          {
            icon: <ShieldCheck className="h-6 w-6" aria-hidden />,
            title: t("Weighed right, billed right", "ശരിയായ തൂക്കം, ശരിയായ ബിൽ"),
            body: t(
              "Loose items are weighed at packing; you pay the actual weight.",
              "പായ്ക്കിംഗ് സമയത്ത് തൂക്കും; യഥാർത്ഥ തൂക്കത്തിന് നൽകും.",
            ),
          },
        ].map((item) => (
          <div
            key={item.title}
            className="flex items-start gap-3 rounded-card border border-line bg-white p-4 shadow-card"
          >
            <span className="rounded-full bg-primary-surface p-2.5 text-primary-700">{item.icon}</span>
            <div>
              <p className="text-sm font-bold text-ink">{item.title}</p>
              <p className="text-xs text-muted">{item.body}</p>
            </div>
          </div>
        ))}
      </section>

      <ProductRail title={t("Best sellers", "ഏറ്റവും കൂടുതൽ വാങ്ങുന്നവ")} products={bestSellers} />

      <ProductRail
        title={t("Seasonal picks", "സീസണൽ ഇനങ്ങൾ")}
        subtitle={t(
          "Fruits and vegetables at their best right now",
          "ഇപ്പോൾ ഏറ്റവും നല്ല പഴങ്ങളും പച്ചക്കറികളും",
        )}
        products={seasonal}
      />

      <section className="flex items-center justify-center gap-2 rounded-card bg-primary-surface p-5 text-center text-sm font-semibold text-primary-800">
        <Truck className="h-5 w-5" aria-hidden />
        {t("Free delivery on orders above ₹499 in Kannur town", "കണ്ണൂർ ടൗണിൽ ₹499-ന് മുകളിൽ സൗജന്യ ഡെലിവറി")}
      </section>
    </div>
  );
}

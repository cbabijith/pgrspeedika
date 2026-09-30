"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@pgrs/ui";

export interface BannerItem {
  id: string;
  titleEn: string;
  titleMl: string;
  subtitleEn: string | null;
  subtitleMl: string | null;
  imageUrl: string;
  linkUrl: string | null;
  badge: string | null;
}

export function BannerCarousel({ banners, lang }: { banners: BannerItem[]; lang: "en" | "ml" }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (banners.length <= 1) return;
    const timer = window.setInterval(() => {
      setIndex((i) => (i + 1) % banners.length);
    }, 6000);
    return () => window.clearInterval(timer);
  }, [banners.length]);

  if (banners.length === 0) return null;
  const banner = banners[index % banners.length] ?? banners[0]!;

  return (
    <section aria-label="Offers" className="relative overflow-hidden rounded-card shadow-card">
      <Link href={banner.linkUrl ?? "/"} className="block">
        <div className="relative aspect-[21/8] w-full sm:aspect-[21/7]">
          <img
            key={banner.id}
            src={banner.imageUrl}
            alt={lang === "en" ? banner.titleEn : banner.titleMl}
            className="h-full w-full object-cover"
          />
          {banner.badge ? (
            <Badge tone="amber" className="absolute left-4 top-4 bg-white/95 text-sm">
              {banner.badge}
            </Badge>
          ) : null}
        </div>
      </Link>

      {banners.length > 1 ? (
        <>
          <button
            type="button"
            aria-label="Previous banner"
            onClick={() => setIndex((i) => (i - 1 + banners.length) % banners.length)}
            className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/85 p-2 text-ink shadow-card hover:bg-white"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Next banner"
            onClick={() => setIndex((i) => (i + 1) % banners.length)}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/85 p-2 text-ink shadow-card hover:bg-white"
          >
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
            {banners.map((b, i) => (
              <button
                key={b.id}
                type="button"
                aria-label={`Go to banner ${i + 1}`}
                aria-current={i === index % banners.length}
                onClick={() => setIndex(i)}
                className={
                  i === index % banners.length
                    ? "h-2 w-6 rounded-full bg-white"
                    : "h-2 w-2 rounded-full bg-white/60"
                }
              />
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}

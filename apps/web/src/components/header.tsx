"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MapPin, Search, ShoppingCart, Languages } from "lucide-react";
import { Badge, Logo } from "@pgrs/ui";
import { useUIStore } from "@/store/ui";
import { SearchBox } from "./search-box";
import { useCartStore } from "@/store/cart";

export function Header() {
  const lang = useUIStore((s) => s.lang);
  const setLang = useUIStore((s) => s.setLang);
  const pincode = useUIStore((s) => s.pincode);
  const areaName = useUIStore((s) => s.areaName);
  const setCartOpen = useUIStore((s) => s.setCartOpen);
  const lines = useCartStore((s) => s.lines);
  const count = lines.reduce((sum, line) => sum + line.quantity, 0);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur">
      <div className="container-page flex h-16 items-center gap-3 md:gap-6">
        <Link href="/" aria-label="PGRS Peedika home" className="shrink-0">
          <Logo />
        </Link>

        <div className="hidden flex-1 md:block">
          <SearchBox />
        </div>

        <nav aria-label="Shop controls" className="ml-auto flex items-center gap-1.5 md:gap-2">
          <button
            type="button"
            onClick={() => setLang(lang === "en" ? "ml" : "en")}
            className="inline-flex h-11 items-center gap-1 rounded-full px-2 text-sm font-semibold text-ink hover:bg-surface-muted"
            aria-label={lang === "en" ? "മലയാളത്തിലേക്ക് മാറുക" : "Switch to English"}
          >
            <Languages className="h-4 w-4" aria-hidden />
            {lang === "en" ? "മലയാളം" : "EN"}
          </button>

          {pincode ? (
            <Link
              href="/"
              className="hidden items-center gap-1 rounded-full bg-primary-surface px-3 py-1.5 text-xs font-bold text-primary-700 sm:inline-flex"
            >
              <MapPin className="h-3.5 w-3.5" aria-hidden />
              {areaName ?? pincode}
            </Link>
          ) : null}

          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="relative inline-flex h-11 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-bold text-white hover:bg-primary-600"
            aria-label={`Cart${mounted ? `, ${count} items` : ""}`}
          >
            <ShoppingCart className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">{lang === "en" ? "Cart" : "കൊട്ട"}</span>
            {mounted && count > 0 ? (
              <Badge tone="amber" className="absolute -right-1 -top-1 min-w-5 justify-center px-1">
                {count}
              </Badge>
            ) : null}
          </button>
        </nav>
      </div>

      <div className="container-page pb-3 md:hidden">
        <SearchBox />
      </div>
      <div className="sr-only">
        <Search aria-hidden />
      </div>
    </header>
  );
}

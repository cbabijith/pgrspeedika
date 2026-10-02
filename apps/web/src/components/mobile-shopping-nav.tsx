"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, LayoutGrid, ShoppingBag, ClipboardList, ArrowRight } from "lucide-react";
import { useCart } from "@/lib/hooks";
import { useCartStore } from "@/store/cart";
import { useUIStore } from "@/store/ui";
import { Money } from "@pgrs/ui";

export function MobileShoppingNav() {
  const path = usePathname();
  const lang = useUIStore((s) => s.lang);
  const { cart, isLoading } = useCart();
  const lines = useCartStore((s) => s.lines);
  const count = lines.reduce((sum, line) => sum + line.quantity, 0);
  const shopping =
    path === "/" ||
    path === "/shop" ||
    path.startsWith("/category/") ||
    path.startsWith("/search") ||
    path.startsWith("/products/");
  const entries = [
    { href: "/", label: lang === "en" ? "Home" : "ഹോം", icon: Home, active: path === "/" },
    {
      href: "/shop",
      label: lang === "en" ? "Shop" : "കട",
      icon: LayoutGrid,
      active: path === "/shop" || path.startsWith("/category/") || path.startsWith("/search"),
    },
    {
      href: "/cart",
      label: lang === "en" ? "Cart" : "കൊട്ട",
      icon: ShoppingBag,
      active: path === "/cart" || path === "/checkout" || path === "/whatsapp",
    },
    {
      href: "/orders",
      label: lang === "en" ? "Orders" : "ഓർഡറുകൾ",
      icon: ClipboardList,
      active: path.startsWith("/orders") || path.startsWith("/guest-orders"),
    },
  ];
  return (
    <div className="mobile-shopping-dock pointer-events-none fixed inset-x-0 bottom-0 z-40">
      {shopping && count > 0 ? (
        <div className="pointer-events-auto mx-auto max-w-xl px-3 pb-2 md:pb-5">
          <Link
            href="/cart"
            className="flex min-h-14 items-center justify-between gap-3 rounded-2xl bg-primary px-4 py-2 text-white shadow-lift"
            aria-label={`View basket, ${count} items`}
          >
            <span aria-live="polite" className="text-sm font-bold">
              {count} {lang === "en" ? "items" : "ഇനങ്ങൾ"}
              <span className="block text-xs font-normal">
                {isLoading ? (
                  "Updating…"
                ) : cart ? (
                  <>
                    <Money paise={cart.totals.subtotalPaise} /> ·{" "}
                    {lang === "en" ? "before delivery" : "ഡെലിവറി ഒഴികെ"}
                  </>
                ) : (
                  "Review your basket"
                )}
              </span>
            </span>
            <span className="flex items-center gap-2 text-sm font-bold">
              {lang === "en" ? "View basket" : "കൊട്ട കാണുക"}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </span>
          </Link>
        </div>
      ) : null}
      <nav
        aria-label="Shopping navigation"
        className="pointer-events-auto grid grid-cols-4 border-t border-line bg-white/95 px-2 pt-1 backdrop-blur md:hidden"
        style={{ paddingBottom: "max(4px, env(safe-area-inset-bottom))" }}
      >
        {entries.map(({ href, label, icon: Icon, active }) => (
          <Link
            key={href}
            href={href}
            aria-label={label}
            aria-current={active ? "page" : undefined}
            className={`relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-bold ${active ? "text-primary-700" : "text-muted"}`}
          >
            <Icon className="h-5 w-5" aria-hidden />
            {label}
            {href === "/cart" && count > 0 ? (
              <span className="absolute right-[20%] top-0 rounded-full bg-primary px-1.5 text-[10px] text-white">
                {count}
              </span>
            ) : null}
          </Link>
        ))}
      </nav>
    </div>
  );
}

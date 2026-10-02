"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3,
  Boxes,
  ClipboardList,
  FileText,
  Heart,
  Image as ImageIcon,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  Package,
  Receipt,
  Settings,
  ShieldCheck,
  Tags,
  Truck,
  Users,
} from "lucide-react";
import { Logo, Sheet } from "@pgrs/ui";
import { roleHas, type Permission } from "@pgrs/contracts";
import { authClient } from "@/lib/auth";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  permission: Permission;
}

const NAV: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: <LayoutDashboard className="h-4 w-4" aria-hidden />,
    permission: "orders:view",
  },
  {
    href: "/orders",
    label: "Orders",
    icon: <ClipboardList className="h-4 w-4" aria-hidden />,
    permission: "orders:view",
  },
  {
    href: "/delivery",
    label: "Delivery",
    icon: <Truck className="h-4 w-4" aria-hidden />,
    permission: "delivery:manage",
  },
  {
    href: "/products",
    label: "Products",
    icon: <Package className="h-4 w-4" aria-hidden />,
    permission: "catalog:manage",
  },
  {
    href: "/quick-price",
    label: "Quick price",
    icon: <Receipt className="h-4 w-4" aria-hidden />,
    permission: "catalog:manage",
  },
  {
    href: "/categories",
    label: "Categories",
    icon: <Tags className="h-4 w-4" aria-hidden />,
    permission: "catalog:manage",
  },
  {
    href: "/inventory",
    label: "Inventory",
    icon: <Boxes className="h-4 w-4" aria-hidden />,
    permission: "inventory:manage",
  },
  {
    href: "/zones",
    label: "Zones & slots",
    icon: <MapPin className="h-4 w-4" aria-hidden />,
    permission: "delivery:manage",
  },
  {
    href: "/customers",
    label: "Customers",
    icon: <Users className="h-4 w-4" aria-hidden />,
    permission: "customers:view",
  },
  {
    href: "/coupons",
    label: "Coupons",
    icon: <Heart className="h-4 w-4" aria-hidden />,
    permission: "coupons:manage",
  },
  {
    href: "/banners",
    label: "Banners",
    icon: <ImageIcon className="h-4 w-4" aria-hidden />,
    permission: "banners:manage",
  },
  {
    href: "/reviews",
    label: "Reviews",
    icon: <FileText className="h-4 w-4" aria-hidden />,
    permission: "reviews:moderate",
  },
  {
    href: "/reports",
    label: "Reports",
    icon: <BarChart3 className="h-4 w-4" aria-hidden />,
    permission: "reports:view",
  },
  {
    href: "/staff",
    label: "Staff",
    icon: <ShieldCheck className="h-4 w-4" aria-hidden />,
    permission: "staff:manage",
  },
  {
    href: "/audit",
    label: "Audit log",
    icon: <FileText className="h-4 w-4" aria-hidden />,
    permission: "audit:view",
  },
  {
    href: "/settings",
    label: "Settings",
    icon: <Settings className="h-4 w-4" aria-hidden />,
    permission: "settings:manage",
  },
];

/** Admin sidebar shell with role-aware navigation. */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const session = authClient.useSession();
  const user = session.data?.user ?? null;
  const role = (user?.role as "owner" | "manager" | "packer" | "delivery" | undefined) ?? null;
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!session.isPending && !user) {
      router.replace("/login");
    }
  }, [session.isPending, user, router]);

  async function signOut() {
    await authClient.signOut();
    router.replace("/login");
  }

  const visibleNav = role ? NAV.filter((item) => roleHas(role, item.permission)) : [];

  const dailyNav = visibleNav.filter((item) =>
    ["/orders", "/products", "/categories", "/inventory"].includes(item.href),
  );
  return (
    <div className="flex min-h-dvh">
      <aside className="hidden w-64 shrink-0 overflow-y-auto bg-primary-700 text-primary-50 md:sticky md:top-0 md:block md:h-dvh">
        <div className="p-4">
          <Link href="/dashboard" className="block rounded-xl bg-white/95 p-2.5">
            <Logo />
          </Link>
        </div>
        {user ? (
          <div className="mx-4 mb-3 rounded-xl bg-white/10 p-3 text-xs">
            <p className="font-bold text-white">{user.name || user.email}</p>
            <p className="uppercase tracking-wide text-primary-200">{user.role}</p>
          </div>
        ) : null}
        <nav aria-label="Admin" className="space-y-0.5 px-2 pb-6">
          {visibleNav.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                aria-current={active ? "page" : undefined}
                className={
                  active
                    ? "flex items-center gap-2.5 rounded-lg bg-white px-3 py-2 text-sm font-bold text-primary-700"
                    : "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-primary-100 hover:bg-white/10 hover:text-white"
                }
              >
                {item.icon}
                {item.label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={signOut}
            className="mt-4 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-primary-100 hover:bg-white/10 hover:text-white"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            Sign out
          </button>
        </nav>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3 border-b border-line bg-white px-4 py-3 md:hidden">
          <button
            type="button"
            aria-label="Toggle menu"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-line"
          >
            <Menu className="h-4 w-4" aria-hidden />
          </button>
          <span className="text-sm font-bold text-primary-700">Owner workspace</span>
        </div>
        {user ? (
          <div className="container-admin">{children}</div>
        ) : (
          <div className="container-admin flex min-h-[60vh] items-center justify-center text-sm text-muted">
            Loading…
          </div>
        )}
      </div>
      <Sheet open={menuOpen} onOpenChange={setMenuOpen} title="Owner menu" side="left" width="max-w-sm">
        <nav aria-label="Owner menu" className="space-y-1 p-4">
          {visibleNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMenuOpen(false)}
              aria-current={pathname.startsWith(item.href) ? "page" : undefined}
              className={`flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-bold ${pathname.startsWith(item.href) ? "bg-primary-surface text-primary-700" : "text-ink"}`}
            >
              {item.icon}
              {item.label}
            </Link>
          ))}
          <button
            type="button"
            onClick={signOut}
            className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-sm font-bold text-danger"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </nav>
      </Sheet>
      {user ? (
        <nav
          aria-label="Owner navigation"
          className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-white px-1 pt-1 md:hidden"
          style={{ paddingBottom: "max(4px, env(safe-area-inset-bottom))" }}
        >
          {dailyNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={pathname.startsWith(item.href) ? "page" : undefined}
              className={`flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-bold ${pathname.startsWith(item.href) ? "bg-primary-50 text-primary-700" : "text-muted"}`}
            >
              {item.icon}
              {item.href === "/inventory" ? "Stock" : item.label}
            </Link>
          ))}
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-expanded={menuOpen}
            className="flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-bold text-muted"
          >
            <Menu className="h-4 w-4" />
            More
          </button>
        </nav>
      ) : null}
    </div>
  );
}

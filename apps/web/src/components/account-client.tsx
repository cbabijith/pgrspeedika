"use client";

import { useQuery } from "@tanstack/react-query";
import { Heart, Package, User } from "lucide-react";
import { Badge, Button, Card, EmptyState, Money, Skeleton } from "@pgrs/ui";
import { api, unwrap } from "@/lib/api";
import { useSession } from "@/lib/hooks";
import { useUIStore } from "@/store/ui";
import { authClient } from "@/lib/auth";

/** Account home: profile, addresses, quick links. */
export function AccountClient() {
  const session = useSession();
  const user = session.data?.user ?? null;
  const lang = useUIStore((s) => s.lang);
  const t = (en: string, ml: string) => (lang === "en" ? en : ml);

  const addresses = useQuery({
    queryKey: ["addresses"],
    enabled: Boolean(user),
    queryFn: () =>
      unwrap<
        Array<{ id: string; label: string; line1: string; city: string; pincode: string; isDefault: boolean }>
      >(api.api.account.addresses.$get()),
  });

  if (!user) {
    return (
      <div className="container-page py-10">
        <EmptyState
          icon={<User className="h-10 w-10" />}
          title={t("Login to view your account", "അക്കൗണ്ട് കാണാൻ ലോഗിൻ ചെയ്യുക")}
          action={
            <Button onClick={() => (window.location.href = "/login?next=/account")}>
              {t("Login", "ലോഗിൻ")}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="container-page space-y-5 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">
          {t("Hello", "നമസ്കാരം")}, {user.name?.split(" ")[0] || "friend"} 👋
        </h1>
        <Button
          variant="outline"
          onClick={async () => {
            await authClient.signOut();
            window.location.href = "/";
          }}
        >
          {t("Sign out", "ലോഗ് ഔട്ട്")}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">{t("Phone", "ഫോൺ")}</p>
          <p className="mt-1 text-lg font-extrabold text-ink">{user.phoneNumber ?? "—"}</p>
          <Badge tone="green" className="mt-2">
            ✓ {t("Verified", "പരിശോധിച്ചത്")}
          </Badge>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">
            {t("Saved addresses", "സേവ് ചെയ്ത വിലാസങ്ങൾ")}
          </p>
          {addresses.isLoading ? (
            <Skeleton className="mt-2 h-8 w-32" />
          ) : (
            <>
              <p className="mt-1 text-lg font-extrabold text-ink">{addresses.data?.length ?? 0}</p>
              <ul className="mt-2 space-y-1 text-xs text-muted">
                {(addresses.data ?? []).slice(0, 2).map((a) => (
                  <li key={a.id}>
                    {a.isDefault ? "⭐ " : ""}
                    {a.label}: {a.line1.slice(0, 30)}… {a.pincode}
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
        <Card className="flex flex-col gap-2 p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">
            {t("Quick links", "ലിങ്കുകൾ")}
          </p>
          <Button variant="secondary" onClick={() => (window.location.href = "/orders")}>
            <Package className="h-4 w-4" aria-hidden /> {t("Order history", "ഓർഡർ ചരിത്രം")}
          </Button>
          <Button variant="secondary" onClick={() => (window.location.href = "/wishlist")}>
            <Heart className="h-4 w-4" aria-hidden /> {t("Wishlist", "വിഷ്ലിസ്റ്റ്")}
          </Button>
        </Card>
      </div>

      <Card className="p-5">
        <h2 className="mb-3 text-base font-bold text-ink">{t("All addresses", "എല്ലാ വിലാസങ്ങളും")}</h2>
        {(addresses.data ?? []).length === 0 ? (
          <p className="text-sm text-muted">
            {t("Add an address at checkout.", "ചെക്കൗട്ടിൽ വിലാസം ചേർക്കാം.")}
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {(addresses.data ?? []).map((a) => (
              <li key={a.id} className="rounded-xl border border-line p-3 text-sm">
                <p className="font-bold text-ink">
                  {a.label} {a.isDefault ? <Badge tone="green">{t("Default", "ഡിഫോൾട്ട്")}</Badge> : null}
                </p>
                <p className="text-muted">
                  {a.line1}, {a.city} — {a.pincode}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <p className="hidden">
        <Money paise={0} />
      </p>
    </div>
  );
}

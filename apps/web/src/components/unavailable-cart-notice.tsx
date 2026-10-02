"use client";

import type { CartDTO } from "@pgrs/contracts";
import { Alert, Button } from "@pgrs/ui";
import { useCartStore } from "@/store/cart";
import { useUIStore } from "@/store/ui";

/** Let a guest remove retired variants without discarding available products. */
export function UnavailableCartNotice({ cart, signedIn }: { cart: CartDTO | null; signedIn: boolean }) {
  const lines = useCartStore((s) => s.lines);
  const replaceAll = useCartStore((s) => s.replaceAll);
  const lang = useUIStore((s) => s.lang);
  if (signedIn || !cart) return null;
  const valid = new Set(cart.items.map((i) => i.variantId));
  if (lines.every((l) => valid.has(l.variantId))) return null;
  return (
    <Alert tone="warning">
      <p>{lang === "en" ? "Some cart items are no longer available." : "കൊട്ടയിലെ ചില സാധനങ്ങൾ ലഭ്യമല്ല."}</p>
      <Button
        variant="secondary"
        size="sm"
        className="mt-2"
        onClick={() => replaceAll(lines.filter((l) => valid.has(l.variantId)))}
      >
        {lang === "en" ? "Remove unavailable items" : "ലഭ്യമല്ലാത്ത സാധനങ്ങൾ നീക്കുക"}
      </Button>
    </Alert>
  );
}

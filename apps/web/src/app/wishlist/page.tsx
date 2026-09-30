"use client";

import { useQuery } from "@tanstack/react-query";
import { Heart } from "lucide-react";
import { Button, EmptyState } from "@pgrs/ui";
import { api, unwrap } from "@/lib/api";
import { useSession } from "@/lib/hooks";

interface WishlistItem {
  productId: string;
}

/** Wishlist of saved products (hearted while browsing). */
export default function WishlistPage() {
  const session = useSession();
  const user = session.data?.user ?? null;

  const wishlist = useQuery({
    queryKey: ["wishlist"],
    enabled: Boolean(user),
    queryFn: () => unwrap<WishlistItem[]>(api.api.wishlist.$get()),
  });

  if (!user) {
    return (
      <div className="container-page py-10">
        <EmptyState
          icon={<Heart className="h-10 w-10" />}
          title="Login to see your wishlist"
          action={<Button onClick={() => (window.location.href = "/login?next=/wishlist")}>Login</Button>}
        />
      </div>
    );
  }

  const products = wishlist.data ?? [];

  return (
    <div className="container-page space-y-4 py-6">
      <h1 className="text-2xl font-extrabold tracking-tight text-ink">Your wishlist</h1>
      {products.length === 0 ? (
        <EmptyState
          title="Nothing saved yet"
          description="Tap the heart on any product to save it for later."
          action={<Button onClick={() => (window.location.href = "/")}>Browse products</Button>}
        />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {products.map((item) => (
            <li key={item.productId}>
              <span className="block rounded-card border border-line bg-white p-4 text-sm font-bold text-primary-700 shadow-card">
                <Heart className="mb-2 h-5 w-5 fill-primary text-primary" aria-hidden />
                Saved item ({item.productId.slice(0, 8)})
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

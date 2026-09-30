"use client";

import { useEffect, useRef } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import type { CartDTO } from "@pgrs/contracts";
import { api, unwrap, ApiRequestError } from "./api";
import { authClient } from "./auth";
import { useCartStore } from "@/store/cart";

export function useSession() {
  return authClient.useSession();
}

/** Cart for the current visitor: server cart when signed in, priced preview for guests. */
export function useCart(pincode?: string | null) {
  const session = useSession();
  const signedIn = Boolean(session.data?.user);
  const localLines = useCartStore((s) => s.lines);
  const replaceAll = useCartStore((s) => s.replaceAll);

  const serverCart = useQuery({
    queryKey: ["cart", pincode ?? ""],
    enabled: signedIn,
    queryFn: () => unwrap<CartDTO>(api.api.cart.$get({ query: pincode ? { pincode } : undefined })),
  });

  const guestCart = useQuery({
    queryKey: ["cart-preview", JSON.stringify(localLines), pincode ?? ""],
    enabled: !signedIn && localLines.length > 0,
    queryFn: () =>
      unwrap<CartDTO>(
        api.api.cart.preview.$post({
          json: { items: localLines },
          query: { pincode: pincode ?? undefined },
        }),
      ),
  });

  // Merge the guest cart into the server cart exactly once after sign-in.
  const mergedFor = useRef<string | null>(null);
  useEffect(() => {
    const userId = session.data?.user?.id;
    if (!userId || mergedFor.current === userId || localLines.length === 0) return;
    mergedFor.current = userId;
    (async () => {
      try {
        await unwrap(api.api.cart.merge.$post({ json: { items: localLines } }));
      } finally {
        replaceAll([]);
      }
    })();
  }, [session.data?.user?.id, localLines, replaceAll]);

  if (signedIn) {
    return {
      signedIn,
      cart: serverCart.data ?? null,
      isLoading: serverCart.isLoading,
      error: serverCart.error,
    };
  }
  return {
    signedIn,
    cart: guestCart.data ?? null,
    isLoading: guestCart.isLoading && localLines.length > 0,
    error: guestCart.error,
  };
}

export function useCartActions() {
  const queryClient = useQueryClient();
  const session = useSession();
  const signedIn = Boolean(session.data?.user);
  const addLocal = useCartStore((s) => s.add);
  const setLocal = useCartStore((s) => s.setQuantity);
  const removeLocal = useCartStore((s) => s.remove);
  const setCouponLocal = useCartStore((s) => s.setCoupon);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["cart"] });

  const addMutation = useMutation({
    mutationFn: async (input: { variantId: string; quantity: number }) => {
      if (signedIn) {
        return unwrap<CartDTO>(api.api.cart.items.$post({ json: { items: [input] } }));
      }
      addLocal(input.variantId, input.quantity);
      return null;
    },
    onSuccess: invalidate,
  });

  const setQuantityMutation = useMutation({
    mutationFn: async (input: { variantId: string; quantity: number }) => {
      if (signedIn) {
        return unwrap<CartDTO>(
          api.api.cart.items[":variantId"].$patch({
            param: { variantId: input.variantId },
            json: { quantity: input.quantity },
          }),
        );
      }
      setLocal(input.variantId, input.quantity);
      return null;
    },
    onSuccess: invalidate,
  });

  const removeMutation = useMutation({
    mutationFn: async (variantId: string) => {
      if (signedIn) {
        return unwrap<CartDTO>(api.api.cart.items[":variantId"].$delete({ param: { variantId } }));
      }
      removeLocal(variantId);
      return null;
    },
    onSuccess: invalidate,
  });

  const applyCouponMutation = useMutation({
    mutationFn: async (code: string) => {
      if (signedIn) {
        return unwrap<CartDTO>(api.api.cart.coupon.$post({ json: { code } }));
      }
      setCouponLocal(code);
      return null;
    },
    onSuccess: invalidate,
  });

  const removeCouponMutation = useMutation({
    mutationFn: async () => {
      if (signedIn) {
        return unwrap<CartDTO>(api.api.cart.coupon.$delete());
      }
      setCouponLocal(null);
      return null;
    },
    onSuccess: invalidate,
  });

  return {
    add: addMutation,
    setQuantity: setQuantityMutation,
    remove: removeMutation,
    applyCoupon: applyCouponMutation,
    removeCoupon: removeCouponMutation,
  };
}

export function isApiError(err: unknown, code?: string): err is ApiRequestError {
  return err instanceof ApiRequestError && (code == null || err.code === code);
}

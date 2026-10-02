"use client";

import { useEffect, useRef } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import type { CartDTO } from "@pgrs/contracts";
import { api, unwrap, ApiRequestError } from "./api";
import { authClient } from "./auth";
import { toast } from "sonner";
import { useCartStore } from "@/store/cart";

export function useSession() {
  return authClient.useSession();
}

/** The public shop always uses a guest basket, independent of owner/admin sessions. */
export function useCart(pincode?: string | null) {
  const localLines = useCartStore((s) => s.lines);
  const guestCart = useQuery({
    queryKey: ["cart-preview", JSON.stringify(localLines), pincode ?? ""],
    enabled: localLines.length > 0,
    queryFn: () =>
      unwrap<CartDTO>(
        api.api.cart.preview.$post({
          json: { items: localLines },
          query: { pincode: pincode ?? undefined },
        }),
      ),
  });
  return {
    signedIn: false,
    cart: guestCart.data ?? null,
    isLoading: guestCart.isLoading && localLines.length > 0,
    error: guestCart.error,
    refetch: guestCart.refetch,
  };
}

export function useCartActions() {
  const queryClient = useQueryClient();
  const signedIn = false;
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

/** Mounted once in Providers: multiple cart views must not merge the same basket. */
export function useGuestCartSync() {
  const session = useSession();
  const localLines = useCartStore((s) => s.lines);
  const replaceAll = useCartStore((s) => s.replaceAll);
  const queryClient = useQueryClient();
  // Merge the guest cart into the server cart exactly once after sign-in.
  const mergedFor = useRef<string | null>(null);
  useEffect(() => {
    const userId = session.data?.user?.id;
    if (!userId || mergedFor.current === userId || localLines.length === 0) return;
    mergedFor.current = userId;
    (async () => {
      try {
        await unwrap(api.api.cart.merge.$post({ json: { items: localLines } }));
        replaceAll([]);
        queryClient.invalidateQueries({ queryKey: ["cart"] });
      } catch (err) {
        mergedFor.current = null;
        toast.error(
          err instanceof Error
            ? err.message
            : "Could not sync your cart. Your items are saved on this device.",
        );
      }
    })();
  }, [session.data?.user?.id, localLines, replaceAll, queryClient]);
}

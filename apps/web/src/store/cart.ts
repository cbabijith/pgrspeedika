"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface CartLineInput {
  variantId: string;
  quantity: number;
}

interface CartState {
  /** Guest cart lines (Zustand persist); synced to the server when signed in. */
  lines: CartLineInput[];
  couponCode: string | null;
  add: (variantId: string, quantity?: number) => void;
  setQuantity: (variantId: string, quantity: number) => void;
  remove: (variantId: string) => void;
  clear: () => void;
  setCoupon: (code: string | null) => void;
  replaceAll: (lines: CartLineInput[]) => void;
  itemCount: () => number;
}

const MAX_PER_VARIANT = 99;

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      lines: [],
      couponCode: null,
      add: (variantId, quantity = 1) =>
        set((state) => {
          const existing = state.lines.find((l) => l.variantId === variantId);
          if (existing) {
            return {
              lines: state.lines.map((l) =>
                l.variantId === variantId
                  ? { ...l, quantity: Math.min(MAX_PER_VARIANT, l.quantity + quantity) }
                  : l,
              ),
            };
          }
          return { lines: [...state.lines, { variantId, quantity }] };
        }),
      setQuantity: (variantId, quantity) =>
        set((state) => ({
          lines:
            quantity <= 0
              ? state.lines.filter((l) => l.variantId !== variantId)
              : state.lines.map((l) =>
                  l.variantId === variantId ? { ...l, quantity: Math.min(MAX_PER_VARIANT, quantity) } : l,
                ),
        })),
      remove: (variantId) =>
        set((state) => ({ lines: state.lines.filter((l) => l.variantId !== variantId) })),
      clear: () => set({ lines: [], couponCode: null }),
      setCoupon: (couponCode) => set({ couponCode }),
      replaceAll: (lines) => set({ lines }),
      itemCount: () => get().lines.reduce((sum, l) => sum + l.quantity, 0),
    }),
    { name: "pgrs-cart" },
  ),
);

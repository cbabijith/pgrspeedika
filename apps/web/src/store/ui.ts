"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Lang } from "@pgrs/contracts";

interface UIState {
  lang: Lang;
  pincode: string | null;
  areaName: string | null;
  cartOpen: boolean;
  setLang: (lang: Lang) => void;
  setPincode: (pincode: string | null, areaName?: string | null) => void;
  setCartOpen: (open: boolean) => void;
}

/** UI preferences persisted locally: language, delivery pincode, drawer state. */
export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      lang: "en",
      pincode: null,
      areaName: null,
      cartOpen: false,
      setLang: (lang) => set({ lang }),
      setPincode: (pincode, areaName = null) => set({ pincode, areaName }),
      setCartOpen: (cartOpen) => set({ cartOpen }),
    }),
    {
      name: "pgrs-ui",
      partialize: (state) => ({ lang: state.lang, pincode: state.pincode, areaName: state.areaName }),
    },
  ),
);

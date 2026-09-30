"use client";

import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
  return (
    <SonnerToaster
      position="top-center"
      toastOptions={{
        style: {
          border: "1px solid var(--color-line)",
          borderRadius: "14px",
          fontFamily: "inherit",
        },
      }}
    />
  );
}

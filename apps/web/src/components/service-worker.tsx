"use client";

import { useEffect } from "react";

/** Registers the offline-shell service worker (PWA). */
export function ServiceWorker() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    const timer = window.setTimeout(() => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Offline shell is a progressive enhancement; ignore failures.
      });
    }, 1500);
    return () => window.clearTimeout(timer);
  }, []);
  return null;
}

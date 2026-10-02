const API_URL = process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
import type { ApiEnvelope } from "./api";

/** Server-side data fetch for RSC pages (catalog prices and stock are read fresh). */
export async function serverFetch<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}${path}`, { cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as ApiEnvelope<T>;
    return body.ok ? (body.data ?? null) : null;
  } catch {
    return null;
  }
}

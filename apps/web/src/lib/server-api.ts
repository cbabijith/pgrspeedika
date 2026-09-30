import { API_URL } from "./constants";
import type { ApiEnvelope } from "./api";

/** Server-side data fetch for RSC pages (page-level revalidate drives ISR). */
export async function serverFetch<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}${path}`);
    if (!res.ok) return null;
    const body = (await res.json()) as ApiEnvelope<T>;
    return body.ok ? (body.data ?? null) : null;
  } catch {
    return null;
  }
}

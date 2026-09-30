import { rateLimited } from "./errors";

type Bucket = { hits: number[] };

const buckets = new Map<string, Bucket>();

function prune(now: number, windowMs: number, bucket: Bucket) {
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);
}

export interface RateLimitOptions {
  /** Sliding window length in milliseconds. */
  windowMs: number;
  max: number;
}

/**
 * In-memory sliding-window limiter. Single-instance by design; swap for Redis
 * when the backend is scaled horizontally.
 */
export function rateLimit(key: string, options: RateLimitOptions): void {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { hits: [] };
    buckets.set(key, bucket);
  }
  prune(now, options.windowMs, bucket);
  if (bucket.hits.length >= options.max) {
    const oldest = bucket.hits[0] ?? now;
    const retryAfterMs = options.windowMs - (now - oldest);
    throw rateLimited(Math.max(1, Math.ceil(retryAfterMs / 1000)));
  }
  bucket.hits.push(now);
  if (buckets.size > 10_000) {
    // Opportunistic cleanup so the map cannot grow unbounded in long-lived processes.
    for (const [k, b] of buckets) {
      prune(now, options.windowMs, b);
      if (b.hits.length === 0) buckets.delete(k);
    }
  }
}

export const RATE_LIMITS = {
  otpSend: { windowMs: 60 * 60 * 1000, max: 5 },
  authLogin: { windowMs: 15 * 60 * 1000, max: 10 },
  checkout: { windowMs: 60 * 60 * 1000, max: 12 },
  default: { windowMs: 60 * 1000, max: 300 },
} satisfies Record<string, RateLimitOptions>;

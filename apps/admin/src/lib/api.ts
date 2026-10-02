"use client";

import { hc } from "hono/client";
import type { AdminAppType } from "@pgrs/backend/app";

/** The Next.js rewrite forwards these same-origin requests to the configured API. */
export const API_URL = "";

/** Typed Hono RPC client for the admin API — cookies travel with each call. */
export const api = hc<AdminAppType>(API_URL, {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, credentials: "include" }),
});

export interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  code?: string;
  message?: string;
  details?: unknown;
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

/** Unwrap the {ok, data} envelope or throw a readable error. */
export async function unwrap<T>(promise: Promise<{ json: () => Promise<unknown> }>): Promise<T> {
  const res = await promise;
  const body = (await res.json()) as ApiEnvelope<T>;
  if (!body.ok) {
    throw new ApiRequestError(body.message ?? "Request failed", body.code ?? "INTERNAL", body.details);
  }
  return body.data as T;
}

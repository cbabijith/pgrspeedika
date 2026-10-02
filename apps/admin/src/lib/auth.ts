"use client";

import { createPgrsAuthClient } from "@pgrs/auth/client";
// The browser receives a first-party HttpOnly cookie from the admin's API proxy.
export const authClient = createPgrsAuthClient(
  typeof window === "undefined" ? "http://localhost:3001" : window.location.origin,
);

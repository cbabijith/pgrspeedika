import { createAuthClient } from "better-auth/react";
import { adminClient, phoneNumberClient } from "better-auth/client/plugins";

export type PgrsAuthClient = ReturnType<typeof createPgrsAuthClient>;

/**
 * Typed Better Auth client for the browser (web + admin apps).
 * Cookies travel with every call (cross-origin sessions).
 */
export function createPgrsAuthClient(baseURL: string) {
  return createAuthClient({
    baseURL,
    fetchOptions: {
      credentials: "include",
    },
    plugins: [phoneNumberClient(), adminClient()],
  });
}

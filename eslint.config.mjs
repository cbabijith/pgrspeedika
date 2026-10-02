// @ts-check
import { baseConfig } from "@pgrs/config/eslint";

/** Root config: shared base + browser-JS specifics for the service worker. */
export default [
  ...baseConfig(),
  {
    ignores: ["**/next-env.d.ts", "**/.next-e2e*/**"],
  },
  {
    files: ["apps/web/public/sw.js"],
    rules: { "no-undef": "off" },
    languageOptions: {
      globals: { self: "readonly", caches: "readonly", fetch: "readonly", URL: "readonly" },
    },
  },
];

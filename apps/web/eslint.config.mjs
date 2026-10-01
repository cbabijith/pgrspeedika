// @ts-check
import { baseConfig } from "@pgrs/config/eslint";

export default [
  ...baseConfig(),
  { ignores: ["next-env.d.ts"] },
  {
    files: ["public/sw.js"],
    rules: { "no-undef": "off" },
    languageOptions: {
      globals: { self: "readonly", caches: "readonly", fetch: "readonly", URL: "readonly" },
    },
  },
];

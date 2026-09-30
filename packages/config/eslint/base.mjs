// @ts-check
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

/**
 * Shared ESLint base for every workspace in the PGRS Peedika monorepo.
 * Apps compose this with their own flat config (see the eslint.config.mjs
 * file inside each app).
 *
 * @param {ReadonlyArray<{ files?: string[]; restrictedImportPatterns?: Array<{ group: string[]; message: string }> }>} [extraConfigs]
 */
export function baseConfig(extraConfigs = []) {
  return tseslint.config(
    {
      ignores: [
        "**/node_modules/**",
        "**/dist/**",
        "**/.next/**",
        "**/.turbo/**",
        "**/coverage/**",
        "**/playwright-report/**",
        "**/test-results/**",
        "**/generated/**",
      ],
    },
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    {
      rules: {
        "@typescript-eslint/no-unused-vars": [
          "error",
          { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
        ],
        "@typescript-eslint/consistent-type-imports": [
          "error",
          { prefer: "type-imports", fixStyle: "inline-type-imports" },
        ],
        "@typescript-eslint/no-explicit-any": "error",
        "no-console": "off",
        eqeqeq: ["error", "smart"],
      },
    },
    ...extraConfigs
      .filter((c) => c && c.files && c.restrictedImportPatterns)
      .map((c) => ({
        files: /** @type {string[]} */ (c.files),
        rules: {
          "no-restricted-imports": [
            "error",
            {
              patterns: /** @type {Array<{ group: string[]; message: string }>} */ (
                c.restrictedImportPatterns
              ),
            },
          ],
        },
      })),
  );
}

export default baseConfig;

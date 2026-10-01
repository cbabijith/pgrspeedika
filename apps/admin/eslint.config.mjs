// @ts-check
import { baseConfig } from "@pgrs/config/eslint";

export default [
  ...baseConfig(),
  {
    ignores: ["next-env.d.ts"],
  },
];

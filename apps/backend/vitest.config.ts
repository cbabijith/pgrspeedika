import { defineConfig } from "vitest/config";
import { config } from "dotenv";

// Tests prefer .env.test (dedicated test database); CI sets DATABASE_URL
// directly, which always wins over the file.
config({ path: "../../.env.test", quiet: true });

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    environment: "node",
    testTimeout: 30_000,
  },
});

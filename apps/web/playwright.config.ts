import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";

// Root .env carries SEED_OWNER_* for the admin flow and API URLs.
config({ path: "../../.env", quiet: true });

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const WEB_PORT = Number(process.env.WEB_PORT ?? 3000);

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "pnpm --filter @pgrs/backend dev",
      url: `${API_URL}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: "pnpm --filter @pgrs/web dev",
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "pnpm --filter @pgrs/admin dev",
      url: `http://localhost:${Number(process.env.ADMIN_PORT ?? 3001)}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});

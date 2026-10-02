import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createDb, applyMigrations } from "@pgrs/db";
import { seedAll } from "../src/seed";

config({ path: "../../.env.test", quiet: true });
config({ path: "../../.env", quiet: true });
const base = new URL(process.env.DATABASE_URL ?? "");
const name = `pgrs_peedika_test_e2e_${process.pid}`;
const controlUrl = new URL(base);
controlUrl.pathname = "/postgres";
const control = createDb(controlUrl.toString(), { max: 1 });
const testUrl = new URL(base);
testUrl.pathname = `/${name}`;
const apiPort = process.env.E2E_API_PORT ?? "4100";
const webPort = process.env.E2E_WEB_PORT ?? "3100";
const adminPort = process.env.E2E_ADMIN_PORT ?? "3101";
const env = {
  ...process.env,
  NODE_ENV: "development",
  DATABASE_URL: testUrl.toString(),
  BETTER_AUTH_SECRET: randomUUID() + randomUUID(),
  SEED_OWNER_EMAIL: "owner@store-e2e.example",
  SEED_OWNER_PASSWORD: randomUUID() + "-owner",
  BETTER_AUTH_URL: `http://localhost:${apiPort}`,
  NEXT_PUBLIC_API_URL: `http://localhost:${apiPort}`,
  BACKEND_URL: `http://localhost:${apiPort}`,
  WEB_URL: `http://localhost:${webPort}`,
  ADMIN_URL: `http://localhost:${adminPort}`,
  CORS_ORIGINS: `http://localhost:${webPort},http://localhost:${adminPort}`,
  PORT: apiPort,
  WEB_PORT: webPort,
  ADMIN_PORT: adminPort,
  ENABLE_TEST_OTP: "true",
  NOTIFY_PROVIDER: "console",
  LOG_LEVEL: "error",
  RAZORPAY_KEY_ID: "",
  RAZORPAY_KEY_SECRET: "",
  RAZORPAY_WEBHOOK_SECRET: "",
};
// Fail before creating fixtures if these isolated ports are already occupied.
for (const port of [apiPort, webPort, adminPort]) {
  let occupied = false;
  try {
    await fetch(`http://localhost:${port}`, { signal: AbortSignal.timeout(500) });
    occupied = true;
  } catch {
    /* Unoccupied. */
  }
  if (occupied)
    throw new Error(`E2E port ${port} is occupied. Choose E2E_API_PORT / E2E_WEB_PORT / E2E_ADMIN_PORT.`);
}
Object.assign(process.env, env);
let db: ReturnType<typeof createDb> | null = null;
try {
  await control.$client.unsafe(`create database "${name}"`);
  db = createDb(testUrl.toString(), { max: 3 });
  await applyMigrations(testUrl.toString());
  await seedAll(db, { ownerEmail: env.SEED_OWNER_EMAIL, ownerPassword: env.SEED_OWNER_PASSWORD });
  const exitCode = await new Promise<number>((resolve, reject) => {
    const child = spawn(
      "pnpm",
      ["--filter", "@pgrs/web", "exec", "playwright", "test", ...process.argv.slice(2)],
      { env, stdio: "inherit" },
    );
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });
  process.exitCode = exitCode;
} finally {
  if (db) await db.$client.end();
  await control.$client.unsafe(`drop database if exists "${name}"`);
  await control.$client.end();
}

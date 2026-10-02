import "../load-env";
import { createAppContext, log } from "../lib/app-context";
import { getEnv } from "../env";
import { processBatch } from "./processor";

const POLL_INTERVAL_MS = 2_000;

async function main() {
  const env = getEnv();
  const ctx = createAppContext(env);
  log("worker").info({ pollMs: POLL_INTERVAL_MS }, "outbox worker started");

  let running = true;
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      running = false;
    });
  }

  while (running) {
    try {
      const processed = await processBatch(ctx);
      if (processed === 0) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
    } catch (err) {
      log("worker").error({ err: String(err) }, "batch failed; retrying");
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }
  log("worker").info("outbox worker stopped");
  process.exit(0);
}

main().catch((err) => {
  log("worker").error({ err: String(err) }, "worker crashed");
  process.exit(1);
});

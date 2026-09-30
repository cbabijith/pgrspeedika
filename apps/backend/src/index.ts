import "./load-env";
import { serve } from "@hono/node-server";
import { buildApp } from "./app";
import { getEnv } from "./env";
import { logger } from "./lib/logger";

const env = getEnv();
const { app } = buildApp();

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  logger.info({ port: info.port, url: `http://localhost:${info.port}` }, "PGRS backend listening");
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    logger.info({ signal }, "shutting down");
    server.close(() => process.exit(0));
  });
}

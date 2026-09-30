import pino from "pino";
import { getEnv } from "../env";

const level = (() => {
  try {
    return getEnv().LOG_LEVEL;
  } catch {
    return "info";
  }
})();

export const logger = pino({
  level,
  base: { service: "pgrs-backend" },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export function childLogger(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}

import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Root .env is canonical; a package-local .env may override (dotenv never
// rewrites variables that are already set, so this stays deterministic).
config({ path: "../../.env", quiet: true });
config({ quiet: true });

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is required for drizzle-kit (set it in the root .env)");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});

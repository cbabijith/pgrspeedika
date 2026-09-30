import { config } from "dotenv";

// Root .env first (canonical), then a package-local .env if present.
// dotenv never overrides variables that are already set.
config({ path: "../../.env", quiet: true });
config({ quiet: true });

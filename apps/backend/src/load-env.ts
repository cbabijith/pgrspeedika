import { config } from "dotenv";

// Root .env first, then a package-local override (dotenv never rewrites
// variables that are already set).
config({ path: "../../.env", quiet: true });
config({ quiet: true });

// vitest does not auto-load .env. Load the repo-root .env so PrismaClient and
// AUTH_CONFIG (BOT_TOKEN/JWT_SECRET) resolve under vitest. No secrets hardcoded
// here — values come from the gitignored .env. (Forward-compat for DB-backed
// tests in later bundles; Bundle C's own tests do not query the DB.)
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, "../../.env") });

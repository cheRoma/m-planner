// vitest does not auto-load .env. Prisma reads process.env.DATABASE_URL,
// so load the repo-root .env before any test/PrismaClient construction.
// No credentials are hardcoded here — values come from the gitignored .env.
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, "../../.env") });

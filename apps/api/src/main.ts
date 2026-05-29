import "reflect-metadata";
import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Load the repo-root .env so DATABASE_URL / AUTH_CONFIG resolve when the dev
// server runs standalone (main.ts lives at apps/api/src, root is three up).
const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(here, "../../../.env") });

async function bootstrap() {
  // Dynamic imports so the .env above is loaded before the module graph
  // (notably @m/db's PrismaClient, which reads DATABASE_URL on construction)
  // is evaluated. Static ESM imports are hoisted and would run too early.
  const { NestFactory } = await import("@nestjs/core");
  const { AppModule } = await import("./app.module");
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();

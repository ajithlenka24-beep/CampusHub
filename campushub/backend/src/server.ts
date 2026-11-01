import { env } from "./config/env.js";
import { createApp } from "./app.js";
import { pool } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";
import { purgeExpiredSessions } from "./services/sessions.js";
import { aiStatus } from "./services/ai/provider.js";
import { ensureBootstrapAdmin, productionWarnings } from "./services/startup.js";

async function main() {
  // Pending migrations are applied automatically, so a fresh database "just works".
  if (env.AUTO_MIGRATE) await runMigrations();
  await ensureBootstrapAdmin();
  await productionWarnings();
  const app = createApp();
  const server = app.listen(env.PORT, () => {
    console.log(`\n  CampusHub API running on http://localhost:${env.PORT}`);
    console.log(`  Frontend URL: ${env.APP_URL}`);
    console.log(`  AI assistant: ${aiStatus().label}\n`);
  });

  const cleanup = setInterval(() => purgeExpiredSessions().catch(() => undefined), 60 * 60 * 1000);
  const shutdown = () => {
    clearInterval(cleanup);
    server.close(() => pool.end().then(() => process.exit(0)));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("[CampusHub] Failed to start:", error.message ?? error);
  if (String(error.message).includes("ECONNREFUSED")) {
    console.error("  Is PostgreSQL running, and is DATABASE_URL in .env correct?");
  }
  process.exit(1);
});

/** Drops ALL CampusHub tables, re-runs migrations and re-seeds (development only). */
import { sql } from "drizzle-orm";
import { db, pool } from "./client.js";
import { runMigrations } from "./migrate.js";
import { assertOnlyDemoAccounts, seed } from "./seed.js";

async function reset() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to reset a production database.");
  // never silently erase accounts that real people created (override with --force)
  await assertOnlyDemoAccounts();
  await db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`);
  await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
  await db.execute(sql`CREATE SCHEMA public`);
  await runMigrations();
  await seed();
}

reset()
  .catch((error) => {
    console.error("Reset failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());

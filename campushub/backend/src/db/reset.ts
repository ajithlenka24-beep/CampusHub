/** Drops ALL CampusHub tables, re-runs migrations and re-seeds (development only). */
import { sql } from "drizzle-orm";
import { db, pool } from "./client.js";
import { runMigrations } from "./migrate.js";
import { seed } from "./seed.js";

async function reset() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to reset a production database.");
  await db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`);
  await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
  await db.execute(sql`CREATE SCHEMA public`);
  await runMigrations();
  await seed();
}

reset()
  .catch((error) => {
    console.error("Reset failed:", error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());

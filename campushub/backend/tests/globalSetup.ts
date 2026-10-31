import { sql } from "drizzle-orm";

/** Recreates the test database schema from the migrations before the test run. */
export default async function setup() {
  if (!process.env.DATABASE_URL?.includes("test")) {
    throw new Error("Refusing to run tests: DATABASE_URL must point at a *test* database (see .env.test).");
  }
  const { db, pool } = await import("../src/db/client.js");
  const { runMigrations } = await import("../src/db/migrate.js");
  await db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`);
  await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
  await db.execute(sql`CREATE SCHEMA public`);
  await runMigrations();
  await pool.end();
}

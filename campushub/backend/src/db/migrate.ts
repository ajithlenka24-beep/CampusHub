import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./client.js";

const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../drizzle");

/** Applies every pending SQL migration in backend/drizzle (safe to run repeatedly). */
export async function runMigrations(): Promise<void> {
  await migrate(db, { migrationsFolder });
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectRun) {
  runMigrations()
    .then(() => console.log("[CampusHub] Database migrations applied."))
    .catch((error) => {
      console.error("[CampusHub] Migration failed:", error);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}

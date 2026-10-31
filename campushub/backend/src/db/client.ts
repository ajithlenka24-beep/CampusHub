import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { env } from "../config/env.js";
import * as schema from "./schema.js";

export const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 10 });

pool.on("error", (error) => {
  console.error("[CampusHub] Unexpected PostgreSQL pool error:", error.message);
});

export const db = drizzle({ client: pool, schema });

export type Database = typeof db;
/** A Drizzle transaction handle (same API as `db`). */
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type DbOrTx = Database | Tx;

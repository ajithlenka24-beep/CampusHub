import { defineConfig } from "drizzle-kit";

// drizzle-kit reads the schema and writes versioned SQL migrations to ./drizzle
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  strict: true,
  verbose: true,
});

import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "turso",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "file:./data/dev.db",
    // Required to run migrations against a Turso branch DB (see ADR-0007);
    // unused for the local file DB used everywhere else today.
    authToken: process.env.TURSO_AUTH_TOKEN,
  },
});

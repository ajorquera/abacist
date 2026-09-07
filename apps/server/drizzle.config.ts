import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "turso",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "file:./data/dev.db",
    // PROTOTYPE (issue #70): required to run migrations against a Turso branch.
    authToken: process.env.TURSO_AUTH_TOKEN,
  },
});

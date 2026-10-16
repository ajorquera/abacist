import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const account = sqliteTable("account", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind").notNull(),
  name: text("name").notNull(),
  institution: text("institution"),
  currency: text("currency").notNull(),
  metadata: text("metadata", { mode: "json" }).notNull().default("{}"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});

export const valueSnapshot = sqliteTable("value_snapshot", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  accountId: integer("account_id")
    .notNull()
    .references(() => account.id),
  amount: integer("amount").notNull(),
  currency: text("currency").notNull(),
  fxRate: real("fx_rate"),
  date: text("date").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`),
});

import { beforeAll, beforeEach } from "vitest";
import { migrate } from "drizzle-orm/libsql/migrator";
import { db } from "../db/client.js";
import { account, valueSnapshot } from "../db/schema.js";

beforeAll(async () => {
  await migrate(db, { migrationsFolder: new URL("../../drizzle", import.meta.url).pathname });
});

beforeEach(async () => {
  await db.delete(valueSnapshot);
  await db.delete(account);
});

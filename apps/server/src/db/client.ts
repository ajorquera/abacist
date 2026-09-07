import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema.js";

const url = process.env.DATABASE_URL ?? "file:./data/dev.db";
// PROTOTYPE (issue #70): a Turso branch DB needs an authToken alongside its
// url, unlike the local file DB used everywhere else today.
const authToken = process.env.TURSO_AUTH_TOKEN;

export const client = createClient(authToken ? { url, authToken } : { url });
export const db = drizzle(client, { schema });

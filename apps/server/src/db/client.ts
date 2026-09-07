import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema.js";

const url = process.env.DATABASE_URL ?? "file:./data/dev.db";
// A Turso branch DB (used for PR previews, see ADR-0007) needs an authToken
// alongside its url, unlike the local file DB used everywhere else today.
const authToken = process.env.TURSO_AUTH_TOKEN;

export const client = createClient(authToken ? { url, authToken } : { url });
export const db = drizzle(client, { schema });

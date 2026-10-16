import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/client.js";
import { account, valueSnapshot } from "../db/schema.js";
import { ACCOUNT_KINDS, isAccountKind } from "../domain/account-kind.js";
import { BASE_CURRENCY } from "../domain/currency.js";

export const accountsRoute = new Hono();

accountsRoute.get("/", async (c) => {
  const kind = c.req.query("kind");
  const rows = kind
    ? await db.select().from(account).where(eq(account.kind, kind))
    : await db.select().from(account);
  return c.json(rows);
});

accountsRoute.post("/", async (c) => {
  const body = await c.req.json();
  const { kind, name, institution, currency, metadata } = body ?? {};

  if (typeof kind !== "string" || kind.trim() === "") {
    return c.json({ error: "kind is required" }, 400);
  }
  if (!isAccountKind(kind)) {
    return c.json({ error: `kind must be one of: ${ACCOUNT_KINDS.join(", ")}` }, 400);
  }
  if (typeof name !== "string" || name.trim() === "") {
    return c.json({ error: "name is required" }, 400);
  }
  if (currency !== BASE_CURRENCY) {
    return c.json({ error: `currency must be ${BASE_CURRENCY} (multi-currency accounts are not supported yet)` }, 400);
  }
  if (institution !== undefined && typeof institution !== "string") {
    return c.json({ error: "institution must be a string" }, 400);
  }
  if (metadata !== undefined && (typeof metadata !== "object" || metadata === null || Array.isArray(metadata))) {
    return c.json({ error: "metadata must be an object" }, 400);
  }

  const [created] = await db
    .insert(account)
    .values({
      kind,
      name,
      institution: institution ?? null,
      currency,
      metadata: metadata ?? {},
    })
    .returning();

  return c.json(created, 201);
});

accountsRoute.post("/:id/snapshots", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) {
    return c.json({ error: "invalid account id" }, 400);
  }

  const [existing] = await db.select().from(account).where(eq(account.id, id));
  if (!existing) {
    return c.json({ error: "account not found" }, 404);
  }

  const body = await c.req.json();
  const { amount, currency, date } = body ?? {};

  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    return c.json({ error: "amount is required and must be a number" }, 400);
  }
  if (currency !== existing.currency) {
    return c.json({ error: `currency must match the account's currency (${existing.currency})` }, 400);
  }
  if (typeof date !== "string" || date.trim() === "") {
    return c.json({ error: "date is required" }, 400);
  }

  const [created] = await db
    .insert(valueSnapshot)
    .values({
      accountId: id,
      amount: Math.round(amount * 100),
      currency,
      fxRate: null,
      date,
    })
    .returning();

  return c.json(created, 201);
});


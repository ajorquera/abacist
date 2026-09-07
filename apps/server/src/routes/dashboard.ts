import { desc } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/client.js";
import { account, valueSnapshot } from "../db/schema.js";
import { BASE_CURRENCY } from "../domain/currency.js";
import { polarityForKind } from "../domain/account-kind.js";

export const dashboardRoute = new Hono();

dashboardRoute.get("/net-worth", async (c) => {
  const accounts = await db.select().from(account);
  const snapshots = await db.select().from(valueSnapshot).orderBy(desc(valueSnapshot.date), desc(valueSnapshot.id));

  const latestByAccount = new Map<number, (typeof snapshots)[number]>();
  for (const snapshot of snapshots) {
    if (!latestByAccount.has(snapshot.accountId)) {
      latestByAccount.set(snapshot.accountId, snapshot);
    }
  }

  let totalCents = 0;
  for (const acc of accounts) {
    const latest = latestByAccount.get(acc.id);
    if (!latest) continue;
    const sign = polarityForKind(acc.kind) === "asset" ? 1 : -1;
    totalCents += sign * latest.amount;
  }

  return c.json({ currency: BASE_CURRENCY, netWorth: totalCents / 100 });
});

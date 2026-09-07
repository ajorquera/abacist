import { describe, expect, it } from "vitest";
import { app } from "./app.js";

type AccountResponse = {
  id: number;
  kind: string;
  name: string;
  institution: string | null;
  currency: string;
};

type ErrorResponse = { error: string };

describe("GET /api/health", () => {
  it("returns ok", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

async function createAccount(overrides: Partial<Record<string, unknown>> = {}) {
  const res = await app.request("/api/accounts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      kind: "cash",
      name: "Checking",
      institution: "Revolut",
      currency: "EUR",
      ...overrides,
    }),
  });
  return res;
}

describe("POST /api/accounts", () => {
  it("creates a cash account", async () => {
    const res = await createAccount({ name: "Main Checking" });
    expect(res.status).toBe(201);
    const body = (await res.json()) as AccountResponse;
    expect(body).toMatchObject({
      kind: "cash",
      name: "Main Checking",
      institution: "Revolut",
      currency: "EUR",
      metadata: {},
    });
    expect(body.id).toEqual(expect.any(Number));
  });

  it("rejects a non-base currency", async () => {
    const res = await createAccount({ name: "USD account", currency: "USD" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorResponse;
    expect(body.error).toMatch(/EUR/);
  });

  it("rejects a missing name", async () => {
    const res = await createAccount({ name: "" });
    expect(res.status).toBe(400);
  });

  it("rejects an unknown kind", async () => {
    const res = await createAccount({ name: "Bogus", kind: "bogus_kind" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrorResponse;
    expect(body.error).toMatch(/kind/);
  });
});

describe("GET /api/accounts", () => {
  it("filters by kind", async () => {
    await createAccount({ name: "Filter Test Account" });
    const res = await app.request("/api/accounts?kind=cash");
    expect(res.status).toBe(200);
    const body = (await res.json()) as AccountResponse[];
    expect(body.some((a) => a.name === "Filter Test Account")).toBe(true);
    expect(body.every((a) => a.kind === "cash")).toBe(true);
  });
});

describe("POST /api/accounts/:id/snapshots", () => {
  it("records a value snapshot in integer cents", async () => {
    const account = (await (await createAccount({ name: "Snapshot Account" })).json()) as AccountResponse;
    const res = await app.request(`/api/accounts/${account.id}/snapshots`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amount: 1234.56, currency: "EUR", date: "2026-01-01" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ accountId: account.id, amount: 123456, currency: "EUR", fxRate: null });
  });

  it("404s for an unknown account", async () => {
    const res = await app.request("/api/accounts/999999/snapshots", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amount: 100, currency: "EUR", date: "2026-01-01" }),
    });
    expect(res.status).toBe(404);
  });

  it("rejects a currency mismatched with the account", async () => {
    const account = (await (await createAccount({ name: "Mismatch Account" })).json()) as AccountResponse;
    const res = await app.request(`/api/accounts/${account.id}/snapshots`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amount: 100, currency: "USD", date: "2026-01-01" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/dashboard/net-worth", () => {
  it("sums the latest snapshot per cash account", async () => {
    const a = (await (await createAccount({ name: "Net Worth A" })).json()) as AccountResponse;
    const b = (await (await createAccount({ name: "Net Worth B" })).json()) as AccountResponse;

    await app.request(`/api/accounts/${a.id}/snapshots`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amount: 100, currency: "EUR", date: "2026-01-01" }),
    });
    // superseded by the later snapshot below and must not double-count
    await app.request(`/api/accounts/${a.id}/snapshots`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amount: 150, currency: "EUR", date: "2026-01-02" }),
    });
    await app.request(`/api/accounts/${b.id}/snapshots`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amount: 50, currency: "EUR", date: "2026-01-01" }),
    });

    const res = await app.request("/api/dashboard/net-worth");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ currency: "EUR", netWorth: 200 });
  });

  it("returns zero when there are no accounts", async () => {
    const res = await app.request("/api/dashboard/net-worth");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ currency: "EUR", netWorth: 0 });
  });
});

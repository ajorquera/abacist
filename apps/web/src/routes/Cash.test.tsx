import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Cash } from "./Cash.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe("Cash", () => {
  it("shows a message when there are no cash accounts", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse([])));
    render(<Cash />);
    expect(await screen.findByText("No cash accounts yet.")).toBeInTheDocument();
  });

  it("lists existing cash accounts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse([{ id: 1, kind: "cash", name: "Checking", institution: "Revolut", currency: "EUR" }]),
      ),
    );
    render(<Cash />);
    expect(await screen.findByText("Checking")).toBeInTheDocument();
    expect(screen.getByText(/Revolut/)).toBeInTheDocument();
  });

  it("creates a new account and reloads the list", async () => {
    let created = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/accounts" && init?.method === "POST") {
        created = true;
        return jsonResponse({ id: 2, kind: "cash", name: "New Account", institution: null, currency: "EUR" }, 201);
      }
      if (url.startsWith("/api/accounts?kind=cash")) {
        return jsonResponse(
          created ? [{ id: 2, kind: "cash", name: "New Account", institution: null, currency: "EUR" }] : [],
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<Cash />);
    await screen.findByText("No cash accounts yet.");

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "New Account" } });
    fireEvent.click(screen.getByRole("button", { name: "Add account" }));

    expect(await screen.findByText("New Account")).toBeInTheDocument();
  });

  it("shows an error when account creation fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "/api/accounts" && init?.method === "POST") {
          return jsonResponse({ error: "currency must be EUR" }, 400);
        }
        return jsonResponse([]);
      }),
    );

    render(<Cash />);
    await screen.findByText("No cash accounts yet.");

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Bad Account" } });
    fireEvent.click(screen.getByRole("button", { name: "Add account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("currency must be EUR");
  });

  it("falls back to a generic error when the failure response isn't JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "/api/accounts" && init?.method === "POST") {
          return new Response("Internal Server Error", { status: 500 });
        }
        return jsonResponse([]);
      }),
    );

    render(<Cash />);
    await screen.findByText("No cash accounts yet.");

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Bad Account" } });
    fireEvent.click(screen.getByRole("button", { name: "Add account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Failed to create account");
  });

  it("records a value snapshot for an existing account", async () => {
    const snapshotCalls: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.startsWith("/api/accounts?kind=cash")) {
          return jsonResponse([{ id: 1, kind: "cash", name: "Checking", institution: null, currency: "EUR" }]);
        }
        if (url === "/api/accounts/1/snapshots" && init?.method === "POST") {
          snapshotCalls.push(JSON.parse(String(init.body)));
          return jsonResponse(
            { id: 10, accountId: 1, amount: 10000, currency: "EUR", fxRate: null, date: "2026-01-01" },
            201,
          );
        }
        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    render(<Cash />);
    await screen.findByText("Checking");

    fireEvent.change(screen.getByLabelText("Amount (EUR) for Checking"), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText("Date for Checking"), { target: { value: "2026-01-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Record value" }));

    await waitFor(() => expect(snapshotCalls).toHaveLength(1));
    expect(snapshotCalls[0]).toEqual({ amount: 100, currency: "EUR", date: "2026-01-01" });
  });
});

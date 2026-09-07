import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { App } from "./App.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/dashboard/net-worth")) {
        return new Response(JSON.stringify({ currency: "EUR", netWorth: 0 }), { status: 200 });
      }
      if (url.startsWith("/api/accounts")) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }),
  );
}

describe("App", () => {
  it("renders the Dashboard route by default", () => {
    stubFetch();
    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeInTheDocument();
  });

  it("renders the Cash route", () => {
    stubFetch();
    render(
      <MemoryRouter initialEntries={["/cash"]}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "Cash" })).toBeInTheDocument();
  });
});

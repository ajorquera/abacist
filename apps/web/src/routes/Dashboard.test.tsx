import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Dashboard } from "./Dashboard.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Dashboard", () => {
  it("shows the net worth total once loaded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ currency: "EUR", netWorth: 1234.5 }), { status: 200 })),
    );

    render(<Dashboard />);

    expect(await screen.findByText(/1234\.50 EUR/)).toBeInTheDocument();
  });
});

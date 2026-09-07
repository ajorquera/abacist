import { useEffect, useState } from "react";

type NetWorth = { currency: string; netWorth: number };

export function Dashboard() {
  const [netWorth, setNetWorth] = useState<NetWorth | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/dashboard/net-worth")
      .then((res) => res.json())
      .then(setNetWorth)
      .catch(() => setError("Failed to load net worth"));
  }, []);

  return (
    <div>
      <h1>Dashboard</h1>
      {error && <p role="alert">{error}</p>}
      {netWorth ? (
        <p>
          Net worth: {netWorth.netWorth.toFixed(2)} {netWorth.currency}
        </p>
      ) : (
        !error && <p>Loading…</p>
      )}
    </div>
  );
}

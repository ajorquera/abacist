import { useEffect, useState } from "react";

type NetWorth = { currency: string; netWorth: number };

export function Dashboard() {
  const [netWorth, setNetWorth] = useState<NetWorth | null>(null);

  useEffect(() => {
    fetch("/api/dashboard/net-worth")
      .then((res) => res.json())
      .then(setNetWorth);
  }, []);

  return (
    <div>
      <h1>Dashboard</h1>
      {netWorth ? (
        <p>
          Net worth: {netWorth.netWorth.toFixed(2)} {netWorth.currency}
        </p>
      ) : (
        <p>Loading…</p>
      )}
    </div>
  );
}

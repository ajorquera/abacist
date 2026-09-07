import { useEffect, useState } from "react";

const BASE_CURRENCY = "EUR";

type Account = {
  id: number;
  kind: string;
  name: string;
  institution: string | null;
  currency: string;
};

type SnapshotDraft = { amount: string; date: string };

export function Cash() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [name, setName] = useState("");
  const [institution, setInstitution] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<number, SnapshotDraft>>({});

  async function loadAccounts() {
    const res = await fetch("/api/accounts?kind=cash");
    setAccounts(await res.json());
  }

  useEffect(() => {
    loadAccounts();
  }, []);

  function draftFor(accountId: number): SnapshotDraft {
    return drafts[accountId] ?? { amount: "", date: "" };
  }

  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/accounts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "cash",
        name,
        institution: institution || undefined,
        currency: BASE_CURRENCY,
      }),
    });
    if (!res.ok) {
      setError((await res.json()).error ?? "Failed to create account");
      return;
    }
    setName("");
    setInstitution("");
    await loadAccounts();
  }

  async function handleAddSnapshot(accountId: number, e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const draft = draftFor(accountId);
    const res = await fetch(`/api/accounts/${accountId}/snapshots`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amount: Number(draft.amount), currency: BASE_CURRENCY, date: draft.date }),
    });
    if (!res.ok) {
      setError((await res.json()).error ?? "Failed to record value");
      return;
    }
    setDrafts((prev) => ({ ...prev, [accountId]: { amount: "", date: "" } }));
  }

  return (
    <div>
      <h1>Cash</h1>
      {error && <p role="alert">{error}</p>}

      <section>
        <h2>Accounts</h2>
        {accounts.length === 0 && <p>No cash accounts yet.</p>}
        <ul>
          {accounts.map((account) => (
            <li key={account.id}>
              <strong>{account.name}</strong>
              {account.institution ? ` — ${account.institution}` : ""}
              <form onSubmit={(e) => handleAddSnapshot(account.id, e)}>
                <label>
                  {`Amount (${account.currency}) for ${account.name}`}
                  <input
                    type="number"
                    step="0.01"
                    value={draftFor(account.id).amount}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [account.id]: { ...draftFor(account.id), amount: e.target.value },
                      }))
                    }
                    required
                  />
                </label>
                <label>
                  {`Date for ${account.name}`}
                  <input
                    type="date"
                    value={draftFor(account.id).date}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [account.id]: { ...draftFor(account.id), date: e.target.value },
                      }))
                    }
                    required
                  />
                </label>
                <button type="submit">Record value</button>
              </form>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Add account</h2>
        <form onSubmit={handleCreateAccount}>
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label>
            Institution
            <input value={institution} onChange={(e) => setInstitution(e.target.value)} />
          </label>
          <button type="submit">Add account</button>
        </form>
      </section>
    </div>
  );
}

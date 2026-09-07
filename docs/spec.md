# Abacist — Product & Technical Spec

A personal net-worth tracking webapp: aggregates assets and liabilities across cash, brokerage positions, property, and debt, and understands spending from manually-imported statements. Solo hobby project, ground-up rebuild (not a reuse of the earlier `my-worth` project), one user, no multi-tenant concerns.

This is the spec produced by [Net worth webapp — spec & brand map](https://github.com/ajorquera/new/issues/1) — a handoff document for build time, not the build itself. Domain vocabulary is canonical in [`CONTEXT.md`](../CONTEXT.md); rationale for the decisions below is canonical in their linked ADRs and tickets. This doc doesn't restate either — it structures and cross-references them.

## Data model

One generic **Account** entity (not a table per kind), classified by `kind` (`cash`, `stock_position`, `property`, `mortgage`, …); Asset/Liability polarity is derived from `kind`. Kind-specific attributes (ticker, quantity, address, …) live in a JSON metadata blob rather than per-kind columns, so new kinds don't need a migration. `institution` (eToro, Revolut, …) is a tag on the Account, not a container — Accounts stay flat.
→ [ADR-0001](adr/0001-generic-account-model.md), [Account/asset model decision](https://github.com/ajorquera/new/issues/2)

**Value Snapshot**: event-based, point-in-time value+currency+date per Account (no fixed schedule); the series is what makes net worth chartable. When the Account's currency differs from Base Currency, the snapshot also stores the FX Rate used, so a historical figure never drifts as today's rate moves.
→ [ADR-0002](adr/0002-fx-rate-point-in-time.md), [FX rate decision](https://github.com/ajorquera/new/issues/5)

**Transaction**: a normalized row imported from a source file into an Account via an Import Schema. Carries `currency`, `fee`, `raw_row`, a `dedup_key` derived from the raw row (safe re-import of overlapping statements), and `import_run_id`. Tagged `external_flow` (deposit/withdrawal/transfer/mortgage payment) at import time by the Import Schema's classification rule — a structural fact, distinct from spend Categories. Can carry multiple Categories (many-to-many); the full amount counts toward each.

**Import Schema**: one reusable, user-selectable mechanism covering both built-in schemas (eToro, Revolut, shipped pre-filled) and user-authored ones (generic banks with no canonical shape) — not two systems. Scoped to a file shape, not an Account (e.g. one bank's two differently-shaped reports need two Schemas; two Revolut currency-pocket Accounts share one). Carries: table-location params (sheet, header-row offset), per-field bindings (column *or* fixed value — some sources never state a field explicitly, e.g. eToro's implicit USD), explicit parsing hints (date format, decimal style — never auto-detected), a row-exclusion rule, and the external-flow classification rule. At import time the app suggests a Schema by column-signature match; the user always confirms.

**Import Run**: records the Schema used, source file, timestamp, and row count for one import. Every Transaction it produced links to it, making a bad import fully reversible (delete everything tied to the run) in one operation.
→ [ADR-0004](adr/0004-import-schema-entity.md), [Import mapping design](https://github.com/ajorquera/new/issues/41), grounded in [CSV import formats research](research/csv-import-formats.md)

**Category**: user-defined, flat (no hierarchy), seeded with a starter set. **Category Rule**: auto-tags a Transaction with one Category when the Transaction's normalized description contains the Rule's match string, optionally scoped to an Account. Every matching Rule applies — no precedence — so a Transaction can end up with several Rule-sourced Categories plus manual ones. Each Transaction-Category tag records its provenance (originating Rule, or manual), so editing/deleting a Rule recomputes only the tags *that Rule* produced, never touching others.
→ [ADR-0003](adr/0003-category-rules-additive-scoped-recompute.md), [Categorization rules engine decision](https://github.com/ajorquera/new/issues/6)

**FX Rate**: fetched from a free external API, cached locally in `fx_rates`, looked up point-in-time per Value Snapshot date (never a live rate).

**Contribution** / **Growth**: the two components of change between two Value Snapshots — Contribution is the sum of External Flow transactions in the period, Growth is the remainder. Mortgage accrued interest is not tracked separately; it falls out of Growth unlabeled, same as market appreciation on any other Account kind — no amortization schedule or interest-rate field in v1.
→ [Mortgage/debt tracking decision](https://github.com/ajorquera/new/issues/8)

Full term definitions and "avoid" synonyms: [`CONTEXT.md`](../CONTEXT.md).

## Tech stack & deploy

- **Frontend**: React + Vite. Routing/forms/data libraries not bundled — picked at build time.
- **Deploy**: fully local (localhost only), no hosting — financial data never leaves the machine. Revisit only if a future effort adds remote/multi-device access. **Exception**: `apps/web`'s static build only is hosted on Netlify (PR previews + a noindex `master` production deploy) — no backend/DB involved; see [ADR-0006](adr/0006-netlify-static-frontend-deploy-exception.md) for scope and tripwire.
- **Auth**: none. Settled by the local-only deploy — no hosting means no exposed auth surface to protect.
- **Database**: SQLite/libSQL. No native exact-decimal type, so multi-currency amounts need an app-level integer-minor-units convention (a build-time detail, not decided here). Turso (hosted libSQL) considered and deferred — same format/API, cheap to migrate to later.
- **Backend/API framework**: left for build time.
→ [Tech stack decision](https://github.com/ajorquera/new/issues/3) (grounded in [stack options research](research/stack-options.md)), [Hosting & auth decision](https://github.com/ajorquera/new/issues/4)

## Backup & restore

Manual-only (no scheduler — real DB + scheduled backups is future scope, once off SQLite). An in-app "Back Up Now" action runs SQLite's `VACUUM INTO` to a timestamped snapshot file (avoids the WAL-consistency footgun of a plain file copy while the app is running). An in-app "Restore" action auto-backs-up the current DB first, swaps in the chosen file, and requires an app restart. Restored DBs go through the normal startup migration path — no special-cased handling. Full-DB snapshot only; no partial/selective export in v1.
→ [Data export/backup decision](https://github.com/ajorquera/new/issues/42)

## Screens (v1)

Kind-based inventory, not one generic Accounts screen:

- **Dashboard** — net worth total, trend chart, per-kind breakdown cards (Cash/Debt/Investments/Assets), each linking to its screen.
- **Cash** — cash accounts.
- **Debt** — mortgage, loans, credit cards.
- **Investments** — eToro/Revolut stock positions, gold.
- **Assets** — home and other manually-valued assets.
- **Income** — job, room rental.
- **Expenses** — spending/category breakdown.
- **Settings** — Accounts CRUD, Category Rules CRUD.
- **Import** — CSV/statement import (Schema pick-or-author, run history, revert).

Explicitly deferred to build time: per-screen layout and chart types, drill-down behavior, whether a global Transactions list exists separately from the kind screens, and whether Income is a new domain concept vs. a filtered External-Flow view.
→ [Core screens & reports decision](https://github.com/ajorquera/new/issues/9)

## Brand

- **Name**: Abacist.
- **Tone/voice**: playful/personal — solo hobby tool, no corporate polish. "Playful branding, serious data": personality lives in the name, logo, empty states, and onboarding copy; the financial UI itself (numbers, transactions, reports) stays plain and neutral.
- **Visual identity**: logo mark is the abacus-frame concept (rows + beads). Typography is `Fredoka` for display, `Space Grotesk` for UI numbers. Palette is coral/sunny-gold/grape/mint for playful surfaces, charcoal/gray neutral palette for the financial UI. Exact bead/frame color mapping is a build-time polish detail.
- **Prototype reference**: three HTML variants on branch `prototype/brand-visual-identity` (commit `bba3545`) — the primary source for build-time implementation, not restated here.
→ [Project naming & voice decision](https://github.com/ajorquera/new/issues/7), [Brand visual identity decision](https://github.com/ajorquera/new/issues/10)

## Out of scope for v1

- Live API auto-sync to eToro/Revolut/banks — manual CSV/statement import only.
- Mortgage amortization schedule, interest-rate field, or principal/interest split.
- Scheduled/automatic backups — manual trigger only until a real DB replaces SQLite.
- Partial/selective export (e.g. a CSV of transactions for spreadsheet use).
- Remote/multi-device access and any auth surface it would require.

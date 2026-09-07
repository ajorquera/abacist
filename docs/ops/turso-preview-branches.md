# Turso PR preview branch lifecycle

Implements the branching model decided in [ADR-0007](../adr/0007-netlify-server-turso-preview-branching.md)
and issue [#68](https://github.com/ajorquera/abacist/issues/68) /
[#72](https://github.com/ajorquera/abacist/issues/72) — read those first for
*why* this exists (PR-preview-only, fixture data, production untouched). This
doc covers *how* it runs, and what a human still needs to do before it does
anything.

## How the lifecycle works

Two GitHub Actions workflows drive this; both **no-op with a clear log
message** (they don't fail) when their required secrets aren't set yet, so
they sit harmlessly unused until provisioned.

### `.github/workflows/turso-preview-branch.yml` — per-PR branch DB

Triggers on `pull_request` events `opened`, `reopened`, `closed`:

- **opened / reopened:** creates a Turso database branch named `pr-<number>`
  from the permanent seed DB via `turso db create pr-<number> --from-db
  <seed>` (copy-on-write — instant, not a fresh migration replay). Reads back
  its connection URL (`turso db show --url`) and mints an auth token for it
  (`turso db tokens create`), then calls the Netlify API to set a
  **branch-scoped** override for `DATABASE_URL` and `TURSO_AUTH_TOKEN` on
  this repo's Netlify site, keyed to the PR's head branch name
  (`github.head_ref`). Netlify picks these values up for that branch's
  deploy-preview context automatically — no redeploy needed after they're
  set, though the first deploy preview build that already ran before this
  job finished may need Netlify to retry/rebuild to pick them up.
  Idempotent: if `pr-<number>` already exists (e.g. a PR reopened without a
  clean close, or the job re-run), creation is skipped rather than erroring.
- **closed:** destroys `pr-<number>` (`turso db destroy pr-<number> --yes`).
  Nothing unsets the Netlify env var override — Netlify tears down the whole
  deploy-preview context for a branch when its PR closes, so there's nothing
  left to point anywhere.

### `.github/workflows/migrate-seed-db.yml` — keeping the seed DB current

ADR-0007 flags a lockstep problem: every PR branches (copy-on-write) off one
permanent seed DB, so if the seed DB's schema falls behind, every new preview
branches off a stale schema. This workflow closes that gap: on push to
`master` that touches `apps/server/drizzle/**` (i.e. a migration was merged),
it resolves the seed DB's own connection URL and a short-lived auth token
(via the Turso CLI, reusing the same `TURSO_API_TOKEN`/`TURSO_ORG`/
`TURSO_SEED_DB` secrets below — no separate seed-DB credentials needed), then
runs `npm run migrate -w apps/server` against it directly, the same command
`test.yml` already runs against a throwaway local DB. The token is only ever
held in that job's memory and isn't stored anywhere.

This was implemented (not left as a manual step) because it's a small,
low-risk addition once the CLI-based create/destroy workflow already exists:
same secrets, same install step, one more `npm run migrate` invocation
against a real target instead of a throwaway file DB. It only runs when
migration files actually change, so it can't interfere with unrelated
pushes to master.

## Secrets this depends on

| Secret | Used for |
| --- | --- |
| `TURSO_API_TOKEN` | Authenticates the Turso CLI in both workflows. |
| `TURSO_ORG` | The Turso organization the seed DB and all PR branches live in (`turso org switch`). |
| `TURSO_SEED_DB` | Name of the permanent seed/template database that every PR branch is created `--from-db`, and that `migrate-seed-db.yml` applies migrations to. |
| `NETLIFY_AUTH_TOKEN` | A Netlify personal access token, used to call the Netlify API and set branch-scoped env var overrides. |
| `NETLIFY_SITE_ID` | The Netlify site ID (API ID, not the site name) that hosts this repo's deploy previews. |

None of these exist in the repo yet — confirmed via `gh secret list --repo
ajorquera/new`, which currently only lists `TRIGGER_TOKEN`.

## Human checklist

Do these in order. Nothing here can be scripted or verified from this
environment (no Turso/Netlify CLI or credentials available here) — a person
with account access needs to do this and then smoke-test it.

1. **Get access to (or create) a Turso organization.** If one doesn't exist
   for this project yet, sign up at https://turso.tech and create an org.
2. **Create the permanent seed/template database** in that org (e.g. `turso
   db create abacist-seed`), then apply the current schema to it once by
   hand: `DATABASE_URL=<its libsql:// url> TURSO_AUTH_TOKEN=<a token for it>
   npm run migrate -w apps/server`. This is the one-time bootstrap;
   `migrate-seed-db.yml` keeps it current after this.
3. **Generate a Turso API token** scoped to that org (`turso auth
   api-tokens mint <token-name>`, or the equivalent in the Turso dashboard).
   Prefer an org-scoped token over a personal one if your Turso plan
   supports it, so this workflow can't reach other orgs on the account.
4. **Get a Netlify personal access token** with access to this repo's site
   (User settings → Applications → New access token in the Netlify UI).
5. **Get this repo's Netlify site ID** (Site settings → General → Site
   details → Site ID in the Netlify UI, or `netlify api listSites` and match
   by name).
6. **On the Netlify site, create the two env vars this workflow will
   override per branch:** `DATABASE_URL` and `TURSO_AUTH_TOKEN`. They need
   to exist first (any placeholder value, e.g. scoped to "Deploy previews"
   context) — Netlify's API sets a branch-scoped *value* on an existing env
   var, it doesn't define new ones from scratch on this call.
7. **Add all five secrets** to the repo (`gh secret set <NAME> --repo
   ajorquera/new`, once per secret): `TURSO_API_TOKEN`, `TURSO_ORG`,
   `TURSO_SEED_DB` (the seed DB's *name*, e.g. `abacist-seed`, from step 2),
   `NETLIFY_AUTH_TOKEN`, `NETLIFY_SITE_ID`.
8. **Smoke-test the whole thing:**
   - Open a real PR against `master`.
   - Confirm `turso-preview-branch.yml` ran and succeeded (not skipped) in
     the Actions tab, and that `turso db list` (or the Turso dashboard) shows
     a new `pr-<number>` database.
   - Confirm the Netlify site's env vars UI shows branch-scoped overrides
     for `DATABASE_URL`/`TURSO_AUTH_TOKEN` on that PR's branch.
   - Open the PR's Netlify deploy preview URL and hit `/api/health` — it
     should respond `{"ok":true}`, served by the standard Function
     (`netlify/functions/api.ts`) against the new branch DB.
   - Close the PR, confirm `turso-preview-branch.yml` ran again and the
     `pr-<number>` database no longer appears in `turso db list`.
   - Merge a change under `apps/server/drizzle/` to `master` and confirm
     `migrate-seed-db.yml` ran and succeeded, applying the new migration to
     the seed DB.

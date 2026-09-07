# Netlify + Hono hosting, and Turso database branching

Research for issue #67, a child of wayfinder map issue #1, feeding the follow-on "grilling"/decision ticket #68 ("Backend + database hosting"). This is **pure fact-gathering**, not a design proposal — no recommendation is made below on whether or how to actually move `apps/server`/the database onto Netlify+Turso; that call belongs to #68.

Current state, for context: per `docs/adr/0005-app-scaffold-stack.md`, `apps/server` runs Hono on `@hono/node-server` (a long-running Node process via `serve()`), with Drizzle ORM + `@libsql/client` against a local SQLite file. Per `docs/adr/0006-netlify-static-frontend-deploy-exception.md` (issue #67's notes call this "ADR-0005", but the file actually on disk at the repo root is numbered `0006-netlify-static-frontend-deploy-exception.md` — noted here since it's a discrepancy between the ticket text and the repo, though it doesn't change any finding below), Netlify today hosts only `apps/web`'s static build; `apps/server` and the database are not deployed anywhere, by design, with an explicit tripwire to revisit before real financial data is exposed.

Concretely, as of this research, `apps/server`'s current shape is:
- `apps/server/src/index.ts` — the entrypoint, calling `@hono/node-server`'s `serve({ fetch: app.fetch, port }, callback)`, i.e. a long-running process that binds a port and listens.
- `apps/server/src/app.ts` — exports `app = new Hono()` with routes attached (currently only `GET /api/health`).
- `apps/server/src/db/client.ts` — `createClient({ url: process.env.DATABASE_URL ?? "file:./data/dev.db" })` from `@libsql/client`, wrapped in `drizzle(client, { schema })`. No `authToken` is passed today.
- `apps/server/drizzle.config.ts` — `drizzle-kit` config already sets `dialect: "turso"` and reads `dbCredentials.url` from the same `DATABASE_URL` env var (defaulting to the same local file), but likewise passes no `authToken`.
- `apps/server/package.json` — dependencies: `@hono/node-server`, `@libsql/client`, `drizzle-orm`, `hono`; scripts: `dev` (`tsx watch`), `build`/`typecheck` (`tsc`), `migrate`/`generate` (`drizzle-kit`).

---

## Hono on Netlify

### Does an official Hono/Netlify adapter exist, and what does it target?

Yes. Hono's own docs list Netlify among its supported runtimes/targets: "Cloudflare Workers, Fastly Compute, Deno, Bun, Vercel, Netlify, AWS Lambda, Lambda@Edge, and Node.js" ([hono.dev/docs](https://hono.dev/docs/), official docs). Hono ships a dedicated Netlify getting-started guide at [hono.dev/docs/getting-started/netlify](https://hono.dev/docs/getting-started/netlify) (official docs).

That guide targets **Netlify Edge Functions specifically, not standard (Node/Lambda-based) Netlify Functions**:
- Entrypoint file: `netlify/edge-functions/index.ts` (official docs, same page).
- Runtime: "Netlify Edge Functions... run on Deno and TypeScript" (official docs, same page).
- Code shape shown by the docs:
  ```ts
  import { Hono } from 'jsr:@hono/hono'
  import { handle } from 'jsr:@hono/hono/netlify'

  const app = new Hono()
  app.get('/', (c) => {
    return c.text('Hello Hono!')
  })

  export default handle(app)
  ```
  (hono.dev getting-started/netlify, official docs — note the doc's own example imports Hono itself from the JSR registry, `jsr:@hono/hono`, not from npm's `hono` package, since Deno-based Edge Functions resolve JSR/URL specifiers rather than a Node `node_modules` tree.)
- Dev/deploy commands: `netlify dev` and `netlify deploy --prod` (same page, official docs).
- Netlify's per-request context is exposed as `c.env.context` (same page, official docs) — e.g. `getConnInfo` for Netlify pulls `c.env.context?.ip` for the client IP ([github.com/honojs/hono `src/adapter/netlify/conninfo.ts`](https://github.com/honojs/hono/blob/main/src/adapter/netlify/conninfo.ts), official Hono source).

**The `hono/netlify` import also exists as a plain npm subpath export**, not only via JSR: the published `hono` npm package's `package.json` declares an `./netlify` export pointing at `dist/adapter/netlify/index.js` (ESM) and `dist/cjs/adapter/netlify/index.js` (CJS) ([unpkg.com/hono/package.json](https://unpkg.com/hono/package.json), primary source — package metadata read directly). That file is a thin re-export (`export * from './mod'`) of the same `handle()` shown in the getting-started guide ([github.com/honojs/hono `src/adapter/netlify/index.ts` and `handler.ts`](https://github.com/honojs/hono/blob/main/src/adapter/netlify/handler.ts), official Hono source: `handle = (app) => (req, context) => app.fetch(req, { context })`). So `apps/server`'s already-installed npm `hono` dependency (`^4.6.13` per `apps/server/package.json`) already contains this adapter — no separate adapter package would need to be added, only a new entrypoint file that imports `hono/netlify` from npm instead of JSR (see open questions below on the JSR-vs-npm/Deno import wrinkle this raises).

A real-world friction point: a GitHub issue on Hono's own repo reports the `create-hono` Netlify template's JSR import failing under `netlify dev` with a DNS/registry resolution error, and documents `deno.land`- or `esm.sh`-hosted URL imports as a workaround ([github.com/honojs/hono issue #3891](https://github.com/honojs/hono/issues/3891), official repo, but the workaround itself is community-reported troubleshooting rather than hono.dev's own documented guidance).

**No separate official Hono guide or adapter was found for standard (non-Edge) Netlify Functions** — i.e. the Node/AWS-Lambda-based function type that Netlify's own docs describe elsewhere (see below), as opposed to the Deno-based Edge Functions Hono's own Netlify guide targets. Hono's AWS Lambda getting-started page does not mention Netlify at all ([hono.dev/docs/getting-started/aws-lambda](https://hono.dev/docs/getting-started/aws-lambda), official docs, checked directly). Separately, Netlify's own modern Functions API describes the same request shape Hono's `handle()` expects — "Functions receive a `Request` and `Context`, returning a `Response`" ([docs.netlify.com/build/functions/overview](https://docs.netlify.com/build/functions/overview/), official docs) — which is structurally compatible with Hono's `app.fetch(req)` signature, but whether wiring `hono/netlify`'s `handle()` (or a hand-written equivalent) into a file under `netlify/functions/` (standard Functions) rather than `netlify/edge-functions/` is something Hono or Netlify actually document/support is not confirmed by any primary source found — flagged as an open question below.

### Routing configuration

Edge Function path routing is declared in `netlify.toml`:
```toml
[[edge_functions]]
path = "/api/*"
function = "your-function-name"
```
with `path` being a [URLPattern](https://developer.mozilla.org/en-US/docs/Web/API/URL_Pattern_API#pattern_syntax) expression matched against incoming request paths, and multiple declarations for the same path chained in file order ([docs.netlify.com/build/edge-functions/declarations](https://docs.netlify.com/build/edge-functions/declarations/), official docs).

For standard Netlify Functions, the general proxy-redirect mechanism is documented as:
```toml
[[redirects]]
from = "/api/*"
to = "https://api.example.com/:splat"
status = 200
```
(shown for an external-service proxy; [docs.netlify.com/manage/routing/redirects/rewrites-proxies](https://docs.netlify.com/manage/routing/redirects/rewrites-proxies/), official docs). The specific pattern of proxying to a function's default path (`/.netlify/functions/:splat`) is Netlify's well-known convention for exposing a function at a shorter path, and every function is served by default at `/.netlify/functions/<function-name>` per Netlify's functions overview, but the exact `to = "/.netlify/functions/:splat"` redirect line was corroborated only via secondary/community sources (e.g. [jamesqquick.com — "How To Redirect Netlify Functions To a Simpler Path"](https://www.jamesqquick.com/blog/how-to-redirect-netlify-functions-to-a-simpler-path/), secondary source) rather than found verbatim on an official docs page during this research — flagged as a minor open item below, though the mechanism (redirects with `:splat`) itself is confirmed official.

### Execution limits, cold starts, streaming, WebSockets

**Standard (synchronous) Netlify Functions:**
- Default synchronous execution limit: **60 seconds**, and explicitly **not configurable** — Netlify's own "Default values" table states "Synchronous execution limit: 60 seconds" with "Configurable?: No" ([docs.netlify.com/build/functions/configuration](https://docs.netlify.com/build/functions/configuration/), official docs). (Some community/support-forum threads reference an older "10 second" synchronous limit and a since-superseded "26 second" extension request — [answers.netlify.com](https://answers.netlify.com/t/request-increase-synchronous-function-timeout-to-26s-pro-plan/168143), secondary/community source — but the officially fetched configuration page's current stated default is 60 seconds, not configurable; treat the 10s/26s figures as historical/community and the 60s figure as current per official docs.)
- Background functions: up to **15 minutes**, available on free/Personal/Pro credit-based plans and Enterprise; they return an immediate `202` to the client and don't support response streaming ([docs.netlify.com/build/functions/background-functions](https://docs.netlify.com/build/functions/background-functions/), official docs).
- Scheduled functions: **30 seconds** ([docs.netlify.com/build/functions/configuration](https://docs.netlify.com/build/functions/configuration/), official docs).
- Streaming responses: enabled by returning a `ReadableStream` as the response `body`, with "a 60-second execution limit and a 20 MB response size limit" for streaming functions specifically ([docs.netlify.com/build/functions/api](https://docs.netlify.com/build/functions/api/), official docs).
- Request/response payload size: Netlify's Async Workloads limitations page states a "6 MB limit for Netlify functions" as the basis for its own payload-size guidance ([docs.netlify.com/build/async-workloads/limitations](https://docs.netlify.com/build/async-workloads/limitations/), official docs). Community sources add more granularity — a ~6 MB request payload limit with binary (base64-encoded) payloads effectively capped around 4.5 MB net, attributed to the underlying AWS Lambda runtime ([answers.netlify.com/t/function-max-request-payload-size](https://answers.netlify.com/t/function-max-request-payload-size/21772), secondary/community source; an official Netlify staff reply in that same thread only says to "go with the AWS values" without confirming an exact figure itself, i.e. this specific number is not fully pinned down by an official source found during this research).
- Cold starts: no official Netlify docs page fetched during this research states a specific cold-start latency number for standard Functions. Community sources report real-world cold starts in the range of hundreds of milliseconds up to several seconds after an idle period ([answers.netlify.com/t/functions-potential-cold-start-issues](https://answers.netlify.com/t/functions-potential-cold-start-issues/107322), and other forum threads found via search, secondary/community source, lower confidence) — flagged as an open question below since no official figure was found.
- WebSockets: no official Netlify docs page fetched during this research makes an explicit statement about WebSocket support for standard Functions. A years-old open GitHub feature-request issue on Netlify's own `functions.netlify.com` repo asks for WebSocket support with no visible official response in the content fetched ([github.com/netlify/functions.netlify.com issue #25](https://github.com/netlify/functions.netlify.com/issues/25), official repo, but unanswered). Multiple community/support-forum sources state Netlify Functions do not support persistent WebSocket connections because the runtime is stateless/short-lived ([answers.netlify.com/t/does-netlify-support-websocket-programming](https://answers.netlify.com/t/does-netlify-support-websocket-programming/4213), secondary/community source). Treat "no WebSocket support" as well-corroborated by secondary sources but not found as an explicit affirmative statement on an official docs page during this research.

**Netlify Edge Functions** (the runtime Hono's own Netlify adapter targets):
- Deno-based runtime, executing at network-edge locations ([docs.netlify.com/build/edge-functions/overview](https://docs.netlify.com/build/edge-functions/overview/), official docs).
- CPU execution time per request: **50 ms** — "This tracks all time spent running your scripts. Execution time does not include time spent waiting for resources or responses" ([docs.netlify.com/build/edge-functions/limits](https://docs.netlify.com/build/edge-functions/limits/), official docs).
- Response header timeout: **40 s** (same page, official docs).
- Memory per set of deployed edge functions: **512 MB** (same page, official docs).
- Code size limit: **20 MB after compression** (same page, official docs).
- Monthly invocation limits vary by plan; cached edge-function responses don't count toward invocations (same page, official docs).
- No official statement on WebSocket support for Edge Functions was found during this research; not confirmed either way from a primary source.

The 50 ms **CPU** execution budget for Edge Functions (as distinct from the 40 s wall-clock header timeout) is the sharpest documented constraint relevant to a REST CRUD API doing DB round-trips and any CSV-parsing work, since CPU time (not wait time) is what's metered — this is stated directly on the limits page cited above, without this doc drawing any conclusion about whether it's sufficient for this app's endpoints.

### What would concretely change in `apps/server`'s current shape

Based on the files read directly in this repo (see intro) and the Hono/Netlify docs above:
- `apps/server/src/index.ts`'s `serve({ fetch: app.fetch, port }, cb)` call (a long-running, port-binding Node process) would not run as-is inside either Netlify Function type — Netlify's own Edge Functions and Functions models both invoke a per-request handler function, not a persistent listening process. A new entrypoint file would be needed (e.g. `netlify/edge-functions/index.ts` per Hono's documented Netlify path) that imports `app` from `apps/server/src/app.ts` and calls `export default handle(app)` using `hono/netlify`'s `handle()`.
- `apps/server/src/app.ts` itself (the `Hono()` instance and its routes) needs no change to run under `handle()` — `handle()` wraps the existing `app.fetch` directly, per the adapter source quoted above.
- A `netlify.toml` `[[edge_functions]]` block (or, if standard Functions turn out to be the actual chosen path — see open question above — a `[[redirects]]` block) would need to be added at the repo root to route `/api/*` to the new function, per the routing syntax cited above. No such Edge/Functions declaration exists in the repo today (per the file listing read directly from `apps/server` and the scope of ADR `0006`, which explicitly limits today's Netlify config to `apps/web`'s static build).
- `apps/server/package.json`'s `@hono/node-server` dependency and `dev`/`build` scripts (`tsx watch src/index.ts`, `tsc -p tsconfig.json`) are oriented around running a standalone Node server; they would need a parallel or replacement dev/build path compatible with `netlify dev` (which the Hono getting-started guide uses to run the Edge Functions locally) rather than (or alongside) the existing `serve()`-based entrypoint.
- Because Hono's documented Netlify path imports Hono itself from JSR (`jsr:@hono/hono`) rather than the npm `hono` package already in `apps/server/package.json`, using the npm `hono/netlify` export instead (confirmed to exist, per above) avoids introducing a second, JSR-sourced copy of Hono — but this substitution (npm import instead of the JSR import hono.dev's own guide shows) is this document's own observation from reading the adapter source and package exports directly, not something hono.dev's Netlify getting-started page itself documents or confirms works identically under Netlify's Deno-based Edge runtime.

---

## Turso branching

### How a branch is created, what it contains, and how it's destroyed

Creating a branch:
```
turso db create <new-database-name> --from-db <existing-database-name>
```
([docs.turso.tech/features/branching](https://docs.turso.tech/features/branching), official docs, and corroborated by [turso.tech/blog/create-a-database-branch-with-github-actions](https://turso.tech/blog/create-a-database-branch-with-github-actions-07bbf804), Turso's own blog).

What a branch actually is at creation time: **"Branching a database is a metadata-only operation, and new branches share existing segments until they diverge, so creating a branch is effectively instant"** ([docs.turso.tech/features/branching](https://docs.turso.tech/features/branching), official docs, quoted directly). In other words, a new branch is a copy-on-write snapshot of the parent database's data (and, implicitly, its schema) as of branch-creation time — not an empty database requiring migrations to be re-run from scratch — and diverges from the parent only as new writes land on either side.

Turso also supports creating a branch from a specific point in time rather than "now":
```
turso db create new-db --from-db old-db --timestamp 2023-10-02T10:16:13-03:00
```
with retention windows that vary by plan — "Starter plan users can restore up to 24h, while Scaler plan users can restore up to 30 days" ([docs.turso.tech/features/branching](https://docs.turso.tech/features/branching), official docs, via search-indexed excerpt of the same page).

Destroying a database (branches included — the docs don't document a separate destroy verb specific to branches, only that a branch is destroyed the same way any database is):
```
turso db destroy <database-name> [-y|--yes]
```
with `-y`/`--yes` confirming the destruction non-interactively ([docs.turso.tech/cli/db/destroy](https://docs.turso.tech/cli/db/destroy), official docs). The branching page itself only states, in prose, that "you will need to manually delete the database branch when you no longer need it" ([docs.turso.tech/features/branching](https://docs.turso.tech/features/branching), official docs) without itself repeating the destroy command's exact syntax — the exact flags come from the separate CLI reference page cited above.

Schema/data changes after branching: branches are "completely separate from the original database," so any schema or data changes made on one side (parent or branch) do not automatically propagate to the other — merging changes back (e.g. from a branch's schema experiment into the parent) is described as something to do "manually using a migration tool" ([docs.turso.tech/features/branching](https://docs.turso.tech/features/branching), official docs, via search-indexed excerpt).

### Cost and plan limits

Per Turso's own pricing page ([turso.tech/pricing](https://turso.tech/pricing), official docs, fetched directly):
- **Free plan**: $0/month, includes up to **100 databases**, 5 GB storage, 500 million monthly rows read, 10 million monthly rows written.
- **Developer**: $4.99/month, **unlimited databases**, 9 GB storage included (+$0.75/GB overage), 2.5 billion rows read included (+$1/billion overage), 25 million rows written included (+$1/million overage).
- **Scaler**: $24.92/month, unlimited databases, 24 GB storage (+$0.50/GB), 100 billion rows read (+$0.80/billion), 100 million rows written (+$0.80/million).
- **Pro**: $416.58/month, unlimited databases, 50 GB storage (+$0.45/GB), 250 billion rows read (+$0.75/billion), 250 million rows written (+$0.75/million).

**Branches count toward a plan's database quota**: "Branches count towards your plan's database quota" ([docs.turso.tech/features/branching](https://docs.turso.tech/features/branching), official docs, quoted directly, corroborated independently via search-indexed excerpt of the same page). On the Free plan this means each open branch consumes one of the 100-database allowance; on any paid plan (Developer and up) the database count itself is unlimited per the pricing page above, so branch count alone would not hit a hard cap on a paid plan (though branches still consume storage/row-usage against the same plan's metered limits, since they hold a copy of the parent's data).

Turso's own pricing page lists an FAQ entry titled **"Do Database Branches cost money?"**, but its answer text is rendered client-side (an accordion) and did not come through in any fetch of the page performed during this research (the question heading appeared in the page's raw content each time, but not the associated answer). **This specific question — whether/how branches are billed beyond consuming a database-count slot and their own storage/row usage — is not confirmed from a primary source and is flagged as an open question below.**

### Automating branch lifecycle to mirror Netlify PR-preview lifecycle

**What officially exists today:**
- An official Turso GitHub Action for **creating** a branch/clone: `tursodatabase/create-database-action`, described as letting you "Automatically create and clone a Turso database," with inputs including `organization_name`, `api_token`, `existing_database_name`, `new_database_name`, and an optional `group_name` (defaulting to `"default"`) ([github.com/tursodatabase/create-database-action](https://github.com/tursodatabase/create-database-action), official Turso repo, and referenced identically from Turso's own blog post [turso.tech/blog/create-a-database-branch-with-github-actions](https://turso.tech/blog/create-a-database-branch-with-github-actions-07bbf804), which shows it triggered off a plain `on: create` (Git-branch-created) event, not a `pull_request` event).
- **No official Turso GitHub Action for destroying/tearing down a branch was found** — a GitHub Marketplace and web search for a Turso "destroy database" action returned no such published action; the `turso db destroy` CLI command exists (cited above) but is not wrapped in an official Action per the sources checked during this research.
- **No official Netlify build plugin for Turso branch-per-deploy-preview was found.** Netlify does publish an official "Turso extension" via its own Extensions marketplace ([developers.netlify.com/guides/get-started-with-turso-extension-for-netlify](https://developers.netlify.com/guides/get-started-with-turso-extension-for-netlify/), official Netlify Developers docs), but per that guide's own setup steps, it injects environment variables for **one selected, fixed Turso database** chosen in the site's configuration UI — it does not create or destroy a distinct database/branch per deploy preview.
- A generic, Netlify-build-plugin-based pattern for "create an isolated preview database when a deploy-preview build starts" does exist and is documented, but for a different backend (Snaplet/Postgres), not Turso: `snaplet/netlify-preview-database-plugin`, whose README shows it hooking into Netlify's build lifecycle so that "before the build starts, the plugin will create a preview database using your latest snapshot" and injects the resulting connection string into `DATABASE_URL`, gated to run "only where the context is set to `deploy-preview`" ([github.com/snaplet/netlify-preview-database-plugin](https://github.com/snaplet/netlify-preview-database-plugin), official repo README, read directly) — **this repository is archived ("archived by the owner on Sep 19, 2024... now read-only")** and is Snaplet-specific, not a working Turso integration; it's cited here only as a documented example of the general "Netlify build-plugin hooks into `deploy-preview` context to provision/tear down a per-preview database" mechanism, which is real and Netlify-native, just not wired to Turso by anyone officially.

**What this implies would need custom work**, stated as a fact about what's missing rather than a recommendation: mapping Turso branch lifecycle onto Netlify's PR-preview lifecycle (branch created when a PR opens a deploy preview; branch destroyed when the PR closes/merges) has no single official, off-the-shelf mechanism covering both ends today. The pieces that do officially exist are: (a) Turso's own Platform API / CLI for branch create and destroy (both cited above with exact syntax), (b) an official GitHub Action for the create half only, and (c) GitHub's own `pull_request` event with `opened`/`closed` (or `synchronize`) activity types as the standard way to trigger a GitHub Actions workflow at PR-open and PR-close/merge time (a GitHub Actions platform mechanism, not something sourced from Turso or Netlify's own docs, so not cited further here as it's outside this research's primary-source scope of Turso/Netlify/Hono docs). Wiring a Turso branch's connection URL/auth token into the corresponding Netlify deploy preview's environment would additionally need either Netlify's own API/CLI (to set a deploy-context-scoped environment variable) or a Netlify build plugin akin to the Snaplet one — neither of which was found, during this research, published as a ready-made Turso-specific integration.

### Fit with the existing Drizzle + `@libsql/client` setup

Per `apps/server/src/db/client.ts` and `apps/server/drizzle.config.ts` (both read directly, see intro), the current setup constructs its `@libsql/client` with **only a `url`** (`process.env.DATABASE_URL`, defaulting to a local `file:./data/dev.db` path) — no `authToken` is passed anywhere today, since a local file doesn't need one.

Turso's own Drizzle integration guide shows the connection Turso itself expects for a remote database:
```ts
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";

const turso = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export const db = drizzle(turso);
```
([docs.turso.tech/sdk/ts/orm/drizzle](https://docs.turso.tech/sdk/ts/orm/drizzle), official docs) — i.e. a remote/Turso connection needs **both** a `libsql://`-style `url` and a separate `authToken`, not just a different `url` value. This means pointing `apps/server` at a Turso branch is **not** a pure connection-string swap under today's code: `client.ts` would need a new `authToken` field added to its `createClient({...})` call (currently absent), sourced from a new environment variable, in addition to swapping `DATABASE_URL`'s value per environment/branch. The branching docs separately confirm each new branch needs its own credential: "you will need to create a new token (or use a group token) to connect to the new database" ([docs.turso.tech/features/branching](https://docs.turso.tech/features/branching), official docs) — so a per-branch (per-PR) deploy would need either a freshly-minted token per branch or a shared "group token" valid across a branch group, sourced and injected per-environment alongside the branch's own URL.

`drizzle.config.ts` already sets `dialect: "turso"` and reads the same `DATABASE_URL` env var as `client.ts` — this part of the scaffold (per `docs/adr/0005-app-scaffold-stack.md`) was already built anticipating a possible future move to Turso, per that ADR's own stated reasoning ("it stays on the libSQL API the spec already calls out as a cheap migration path to Turso later if the deploy target ever changes"). `drizzle.config.ts`'s `dbCredentials` block would need the same `authToken` addition as `client.ts` for `drizzle-kit migrate`/`generate` to run migrations directly against a remote branch, since drizzle-kit's `turso` dialect uses the same `@libsql/client`-style credentials shape Turso's own docs show above (this specific inference about `drizzle-kit`'s `dbCredentials` shape was not separately confirmed against a drizzle-kit-specific primary source during this research beyond the parallel structure already present in `apps/server/drizzle.config.ts` itself — flagged as a minor open item below).

Because a new branch already carries a snapshot of the parent's schema and data as of branch-creation time (per the copy-on-write finding above), a fresh branch created from a schema-migrated parent does not need `drizzle-kit migrate` re-run from zero — only whatever new migrations are being introduced by the PR itself would need to be applied to that specific branch, the same way they'd be applied to any environment.

---

## Open questions / things this doc does NOT resolve

- Whether Hono's official Netlify adapter (`hono/netlify`'s `handle()`) is documented or supported for standard (Node/Lambda-based) Netlify Functions in addition to Edge Functions — hono.dev's own getting-started guide only shows the Edge Functions path (`netlify/edge-functions/`); no primary source confirming or ruling out the standard-Functions path was found.
- The exact answer to Turso's own pricing-page FAQ question "Do Database Branches cost money?" — the question is listed on [turso.tech/pricing](https://turso.tech/pricing) but its answer text is rendered client-side and did not come through any fetch performed during this research.
- An exact, official figure for Netlify standard Functions' request/response payload size limit — a "6 MB limit for Netlify functions" is stated on Netlify's Async Workloads limitations page, and a more granular ~4.5 MB effective binary-payload figure appears in Netlify community-forum threads (not an official docs page, and an official staff reply in that same thread declined to confirm an exact number).
- An official, documented cold-start latency figure for either Netlify standard Functions or Edge Functions — no official docs page fetched during this research states one; only community/support-forum reports of real-world cold-start times were found.
- An explicit official statement (from Netlify) that standard Functions or Edge Functions do or don't support WebSockets — well-corroborated as "not supported" by secondary/community sources and an unanswered official GitHub feature request, but no official docs page made this statement directly.
- Whether `drizzle-kit`'s `dialect: "turso"` config accepts the exact same `{ url, authToken }` shape shown in Turso's Drizzle-ORM connection guide for its own `dbCredentials` block — inferred from the parallel structure already present in `apps/server/drizzle.config.ts`, not independently confirmed against a drizzle-kit-specific primary source.
- The exact official `netlify.toml` redirect line proxying to a function's default path (`to = "/.netlify/functions/:splat"`) — the general redirect/proxy mechanism and `/.netlify/functions/<name>` default path convention are each independently confirmed by official docs, but the exact combined line was corroborated only via a secondary/community source during this research.

// Runs apps/server's existing Hono app (apps/server/src/app.ts, untouched) as
// a Netlify standard Function, for PR-preview backend hosting per ADR-0007
// (docs/adr/0007-netlify-server-turso-preview-branching.md). Edge Functions
// were ruled out there — their CPU budget is too tight for a DB-backed API.
//
// There's no official `hono/netlify` adapter for standard Functions (only for
// Edge Functions), so this hand-rolls the wrapper: Netlify's modern Functions
// API hands a `Request` and expects a `Response` back, the same shape Hono's
// `app.fetch` already produces. Proven to work with zero route changes in the
// throwaway prototype, PR #71 (issue #70).
import { app } from "../../apps/server/src/app.js";

// For the `/api/*` -> `/.netlify/functions/api/:splat` redirect in
// netlify.toml (status = 200, a rewrite), Netlify hands this function the
// *original* request path (e.g. "/api/health"), not the rewritten
// "/.netlify/functions/api/:splat" path — confirmed empirically in PR #71
// (issue #70). So no path-stripping is needed: Hono's routes already match
// the path Netlify passes through.
export default async (req: Request) => app.fetch(req);

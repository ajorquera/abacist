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

// For the `/api/*` -> `/.netlify/functions/api/:splat` rewrite (see
// netlify.toml's generated `_redirects` file, status = 200), Netlify hands
// this function the *original* request path (e.g. "/api/health"), not the
// rewritten "/.netlify/functions/api/:splat" path — confirmed empirically
// in PR #71 (issue #70). So no path-stripping is needed: Hono's routes
// already match the path Netlify passes through.
//
// Second, independent guard against this ever running outside a PR deploy
// preview: netlify.toml deletes this whole directory before Netlify's
// function-bundling step in every context except `deploy-preview` (see the
// comment there), so normally this code isn't even deployed anywhere else.
// PREVIEW_API_ENABLED is a plain env var only set to "true" via
// [context.deploy-preview.environment] in netlify.toml, so this still
// refuses to serve anything if that build-time removal is ever changed by
// mistake and this file gets bundled/deployed to production regardless.
// Production must stay backend-free per ADR-0006/ADR-0007.
export default async (req: Request) => {
  if (process.env.PREVIEW_API_ENABLED !== "true") {
    return new Response("Not found", { status: 404 });
  }
  return app.fetch(req);
};

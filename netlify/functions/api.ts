// PROTOTYPE (issue #70) — throwaway wrapper answering: can apps/server's Hono
// app run as a Netlify *standard* Function via a hand-rolled wrapper, with no
// official hono/netlify adapter (that adapter targets Edge Functions only)?
//
// Netlify's modern Functions API hands a (Request, Context) and expects a
// Response back — the same shape as Hono's `app.fetch`. Netlify's rewrite
// behavior for the `/api/*` -> `/.netlify/functions/api/:splat` redirect
// (see root netlify.toml) isn't confirmed by any official doc (per research
// in #67): it may hand the function the original "/api/health" path, or the
// rewritten "/.netlify/functions/api/health" path. Strip the function-name
// prefix defensively so either case resolves to a path Hono's routes match.
import { app } from "../../apps/server/src/app.js";

export default async (req: Request) => {
  const url = new URL(req.url);
  const strippedPath = url.pathname.replace(/^\/\.netlify\/functions\/api/, "") || "/";

  if (strippedPath === url.pathname) {
    return app.fetch(req);
  }

  const rewritten = new URL(strippedPath + url.search, url.origin);
  return app.fetch(new Request(rewritten, req));
};

# Web and API share app.useprq.com (web on /*, API on /api/*)

**Status:** accepted

## Context & decision

The dashboard SPA (`@prq/web`, TanStack Start in SPA mode) calls the API with relative
`/api` paths so host-only session cookies and Hono's `csrf()` middleware work with no
CORS and no `SameSite=None` (the same-origin premise from ADR 0001). For that to hold in
production, the web app and the API must serve the **same origin**.

We deploy **two Workers on one hostname, `app.useprq.com`**: `prq-web` owns the route
`app.useprq.com/*` (the SPA shell + edge-served client assets via `@cloudflare/vite-plugin`),
and `prq-api` owns the strictly-more-specific `app.useprq.com/api/*`. Cloudflare routes by
most-specific match, so `/api/*` always reaches the API and everything else reaches the web
Worker, with no ordering config. The apex `useprq.com` is deliberately served by neither
Worker and is reserved for a future landing-page app.

## Considered options

- **API on the apex `useprq.com`, web on `app.useprq.com` (cross-origin)** — rejected:
  forces CORS plus `SameSite=None` cookies, which is exactly the error class ADR 0001's
  same-origin design eliminates.
- **One combined Worker serving both the SPA and the API** — rejected: couples two
  independently-deployed, independently-tested codebases (Hono + Hyperdrive vs a Vite SPA
  build) and their release cadences into a single deploy.
- **Web as static Cloudflare Pages instead of a Worker** — rejected: not the supported
  TanStack Start target and diverges from the API's wrangler tooling; the Vite-plugin
  Worker already serves assets from the edge without a Worker invocation on asset hits.

## Consequences

- The origin is encoded once per Worker in its `wrangler.jsonc` (`prq-api` also carries it
  in `PRQ_WEB_URL` + `PRQ_GITHUB_CALLBACK_URL`, which legitimately differ from the web
  origin in local dev, so they are not duplication).
- Moving origins later is a coordinated change: both Worker routes, the API URL vars, and
  the GitHub App OAuth callback + webhook URLs must move together. This is the "hard to
  reverse" cost the same-origin choice accepts in exchange for zero CORS/CSRF plumbing.
- The apex stays free for an independent landing app without touching either Worker.

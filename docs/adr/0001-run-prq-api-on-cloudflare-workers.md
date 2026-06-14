# Run prq-api on Cloudflare Workers with per-request config and a deep request context

**Status:** accepted

## Context & decision

prq-api (Hono) deploys as a Cloudflare Worker backed by Supabase Postgres through a
Hyperdrive binding. The original Worker entry point relied on module-load globals:
`config.ts` froze GitHub App config from `process.env` at import, and route modules
built the Drizzle client singleton at import. In a Workers isolate, module evaluation
runs before the fetch handler, so the DB pinned to the localhost fallback and secrets
read empty.

We resolve all config and the database **per request from `c.env`** (via Hono's
`env()` adapter, which reads `c.env` on Workers and `process.env` on Node), behind a
single deep `request-context` module that hides postgres.js, Drizzle, store
construction, the connection string, and the Node-vs-Workers split. Handlers and
entry points see only a `ctx` handle. Hyperdrive points at Supabase's **direct
`:5432`** connection (session mode), so prepared statements stay on (`prepare: true`,
which Hyperdrive caches); the Worker pool uses `max: 5`, `fetch_types: false`.

This keeps one code path for both runtimes, deletes the module-load globals, and lets
the cron `scheduled()` handler reuse the same context builder. It is Ousterhout-aligned
(deep module, information hiding, errors defined out of existence), consistent with the
product's stated design principles.

## Considered options

- **Thin `c.var` (raw db + config); handlers assemble their own stores** — rejected:
  leaks the db→store mapping into every handler, widens the per-handler interface, and
  is re-derived per route.
- **Keep module-load globals; set `process.env` in `fetch` via dynamic import** —
  rejected: relies on Cloudflare's discouraged `process.env` population and undocumented
  module-eval timing, and is not type-safe.
- **Hyperdrive → Supabase transaction pooler (`:6543`)** — rejected: forces
  `prepare: false` and loses Hyperdrive's prepared-statement caching; direct `:5432` is
  Cloudflare's recommended target.

## Consequences

- A single `assertRequiredConfig()` is shared by both entry points, replacing four
  scattered `process.exit` gates in `index.ts` and closing the Worker's missing-gate
  parity gap. Missing production config fails loudly, once.
- The session cookie `secure` flag derives from resolved env, not a buried
  `process.env.NODE_ENV` read, so it cannot silently be wrong.
- `tsconfig` pins `types: ["node"]`: the Worker code uses Node/undici and Hono types
  with a hand-defined `Env`, and auto-loading `@cloudflare/workers-types` globally was
  shadowing Node globals (`process`, `Buffer`) and breaking the build.
- Rolled out in staged, individually verified commits: (1) config + DB driver
  primitives, (2) deep request context + shared `createApp()`, (3) production Worker
  config + secrets, (4) Supabase migration, (5) auto-retarget cron trigger,
  (6) deploy + CI.

## Addendum (2026-06-13): the module-load premise did not reproduce

The Context above claims module evaluation runs before the fetch handler "so the DB
pinned to the localhost fallback and secrets read empty." Direct testing under workerd
(compat `2026-05-01`, `nodejs_compat`) did not reproduce this: `process.env` IS
populated from `vars` at module-load time, so the module-load config globals
(`githubAppAuthConfig` and friends) resolve their real values, not empty strings. The
original "secrets read empty / config globals are empty" rationale is therefore not
accurate at this compatibility date, and should not be cited as the reason for the
refactor.

The per-request refactor still stands on its own, for a reason that does not depend on
config timing:

- **The Hyperdrive connection is only reachable inside a request/invocation.** The DB
  connection string comes from the `HYPERDRIVE` binding on `c.env` (workers) or the
  `scheduled()` `env`, not from `process.env`. That binding is not available at
  module-load, and Workers forbid I/O at top-level eval, so a module-load DB singleton
  cannot open the Hyperdrive connection at all. The DB must be opened per request and
  closed (`waitUntil(client.close())`), independent of whether `process.env` is
  populated. This is the load-bearing justification.
- The shared `assertRequiredConfig()` gate (fetch + cron parity) and the deep
  `request-context` (information hiding, one code path for both runtimes) are
  independent design wins that hold regardless.

**Open question, not closeable locally:** whether *secrets* (set with `wrangler secret
put`) populate `process.env` at module-load on a *deployed* worker. `wrangler dev`
sources both `vars` and secrets from `.dev.vars`, so it cannot distinguish a true
secret from a var; the test above only proves the behavior for `vars`. A one-off check
on the deployed worker (log whether a known secret is present in `process.env` at
module-load) would settle it. Until then, the per-request resolution is also the safe
default for secrets even if the `vars` finding does not extend to them.

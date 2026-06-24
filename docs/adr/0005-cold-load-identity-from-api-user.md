# Cold-load identity comes from /api/user, not the /api/prs response

The dashboard is scoped per viewer: settings (including Custom-mode tracked
repos) live in localStorage namespaced by the viewer's GitHub login, and the
`/api/prs` request carries the resulting `?repos=` filter. So the client must
know the viewer's login before it can fire a correctly-scoped crawl.

Identity used to be read from the `/api/prs` response itself (`viewerLogin` was
set from the first fetch). Because that fetch had to run before the login was
known, a returning Custom-mode user fired `/api/prs` twice on every cold load:
once unscoped (All mode, the pre-hydration default), then again scoped once
settings hydrated. The first crawl was pure wasted work, since the server crawls
the full authorized scope regardless of `?repos` and only bucket-filters after.

## Decision

The web client bootstraps `viewerLogin` from `/api/user` (a cheap database
session lookup, no GitHub crawl) via the existing `useTokenHealth` query, and
gates the `/api/prs` crawl on the viewer's settings having hydrated from that
login. The crawl runs exactly once, already scoped.

Do **not** derive `viewerLogin` from the `/api/prs` response. It is the obvious
shortcut (the field is right there in the payload) and reintroduces the double
crawl, the hydration-order deadlock (gating a query on state derived from its own
result), and the account-swap stale-scope race. The field may remain in the
response for other uses, but it is not the identity source.

## Considered and rejected

- **Cache the last login in localStorage** (bootstrap with zero added round
  trips): faster on the happy path, but adds a second client-side source of truth
  for identity, a stale-scoped crawl on out-of-band account swaps, and
  clear-on-sign-out logic. Asking `/api/user` keeps identity authoritative and
  fresh for one cheap, already-needed round trip.

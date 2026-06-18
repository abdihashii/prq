# Restrict sign-in to an allowlist of GitHub accounts

The GitHub App must be **public** so accounts other than the owner can reach the OAuth
authorize page (a private App 404s for every non-owner), but public means anyone on
GitHub could complete sign-in. GitHub App visibility is binary with no per-account
allowlist, so PRQ gates sign-in itself: `completeGitHubAppCallback` rejects any account
whose numeric GitHub user ID is not in `PRQ_GITHUB_ALLOWED_USER_IDS`, right after the
viewer is fetched and before any DB writes (mirrors `verifyCallbackInstallation`).

## Decision

- **Numeric user IDs, not logins.** IDs are stable across renames; a login can change
  (or be reclaimed by someone else after a rename), which would silently break or widen
  an access gate. The id is already normalized to a string by `GitHubIdSchema`.
- **Fail-closed.** An empty or unset allowlist denies *everyone*. A misconfigured prod
  locks out rather than silently going open after the App is made public.

## Consequences

- `PRQ_GITHUB_ALLOWED_USER_IDS` must be set in **every** environment, including local
  dev, or sign-in fails for all accounts. Documented as required in `.env.example`.
- Self-hosters (e.g. a future OSS release) set their own list; there is no implicit
  "allow all" escape hatch.

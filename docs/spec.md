# Spec

> **Name:** short for "PR queue." Three letters, types fast, easy to alias in a shell, unique enough to grep, googleable if it ever ships as OSS.

## 1. Overview

A local-only dashboard for tracking GitHub pull requests across two perspectives: PRs that need my action, and my own PRs in flight. Built to replace the parts of Graphite I actually used (observability, PR status, ready-to-merge signals) without the $50/month price tag.

Runs on localhost. Single user. No auth, no deployment, no multi-tenant concerns.

## 2. Goals & Non-goals

### Goals

- See at a glance which PRs need my attention (review or response).
- See the state of my own open PRs without bouncing between tabs.
- Surface actionable signals: CI status, review state, merge readiness, conflicts.
- Auto-refresh so the view is always current.

### Non-goals

- Stacked PRs.
- Authentication or multi-user support.
- Public hosting.
- Mobile / responsive design.
- Webhooks (polling only).
- Replicating GitHub's full PR UI — link out for details.

## 3. Dashboard

Five vertically-stacked buckets, ordered by urgency:

1. Needs my review
2. Needs my attention
3. Ready to merge
4. Waiting on others
5. Drafts

```
┌─────────────────────────────────────────────────────────────────────────┐
│  prq                                             Last synced: 12s ago   │
│  [ Refresh ]  [ Settings ]                                              │
└─────────────────────────────────────────────────────────────────────────┘

┌─ 🟣 NEEDS MY REVIEW (3) ────────────────────────────────────────────────┐
│  ✓ checks  ●●○ 2 comments   org/repo #428                      2h ago   │
│  "Add retry logic to webhook dispatcher"                                │
│  by @teammate · base: main                                              │
│ ─────────────────────────────────────────────────────────────────────── │
│  ⏳ checks  ●○○ 0 comments   org/repo #431                    23m ago   │
│  "Refactor auth middleware"                                             │
│  by @teammate2 · base: main · re-review (new commits since you ✓)       │
└─────────────────────────────────────────────────────────────────────────┘

┌─ 🔴 NEEDS MY ATTENTION (2) ─────────────────────────────────────────────┐
│  Changes requested · ✓ checks   org/repo #420                  1d ago   │
│  "Implement rate limiter"                                               │
│  base: main · 3 unresolved comments from @reviewer                      │
└─────────────────────────────────────────────────────────────────────────┘

┌─ 🟢 READY TO MERGE (1) ─────────────────────────────────────────────────┐
│  Approved · ✓ checks · no conflicts   org/repo #418           30m ago   │
│  "Update logging format"                                                │
│  base: main                                                             │
└─────────────────────────────────────────────────────────────────────────┘

┌─ 🟡 WAITING ON OTHERS (2) ──────────────────────────────────────────────┐
│  Review pending · ✓ checks   org/repo #430                    45m ago   │
│  "Add OpenTelemetry tracing"                                            │
│  base: main · requested: @teammate, @teammate2                          │
└─────────────────────────────────────────────────────────────────────────┘

┌─ ⚪ DRAFTS (1) ─────────────────────────────────────────────────────────┐
│  Draft · ⏳ checks   org/repo #433                            10m ago   │
│  "WIP: experimental cache layer"                                        │
│  base: main · 4 commits                                                 │
└─────────────────────────────────────────────────────────────────────────┘
```

### Row anatomy

Each PR row shows:

- CI status icon (✓ passing, ⏳ pending, ✗ failing)
- Review state badge (Approved / Changes requested / Pending / Draft)
- Comment count + unresolved indicator
- Repo name + PR number
- PR title
- Author (review bucket) or base branch
- Time since last activity
- Contextual hint when relevant (re-review, new comments since push, merge conflict)

### Interaction

- Click row → opens PR on GitHub in a new tab.
- Manual refresh button + auto-poll.
- "Last synced" timestamp visible at the top.
- Empty buckets render the header with `(0)` but the body collapses, so the dashboard stays scannable.

## 4. Bucket Logic

A PR appears in exactly one bucket. Rules are evaluated top to bottom; first match wins.

**Definitions:**

- "My PR" = `author?.login == viewer.login` (the `author` field is nullable for ghost/deleted accounts; null falls into "Others' PR").
- "Others' PR" = anything else.

| Bucket             | Rule                                                                                                                                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Drafts             | My PRs where `isDraft = true`. Drafts always win — review noise is ignored while WIP.                                                                                                                                     |
| Needs my review    | Others' PRs where I'm a requested reviewer, OR I've already reviewed but new commits exist since my last review.                                                                                                          |
| Needs my attention | My PRs where `reviewDecision = CHANGES_REQUESTED`, OR new review comments exist since my last push.                                                                                                                       |
| Ready to merge     | My PRs where `reviewDecision = APPROVED`, `statusCheckRollup.state = SUCCESS` (strict — `PENDING`/`FAILURE`/`ERROR`/`EXPECTED` do not qualify), `mergeable = MERGEABLE` (strict — `UNKNOWN` does not qualify), not draft. |
| Waiting on others  | My open, non-draft PRs not matching any rule above. Includes PRs with `mergeable = UNKNOWN` waiting for GitHub to compute merge state.                                                                                    |

**Display order in the UI** differs from evaluation order. The dashboard renders buckets by urgency:

1. Needs my review
2. Needs my attention
3. Ready to merge
4. Waiting on others
5. Drafts

## 5. Data Model

For each PR, capture from the API:

- `id` (GraphQL node ID)
- `number`
- `title`
- `url`
- `repository` (owner/name)
- `author` (login)
- `baseRefName`
- `isDraft`
- `reviewDecision` — `APPROVED` | `CHANGES_REQUESTED` | `REVIEW_REQUIRED` | null
- `mergeable` — `MERGEABLE` | `CONFLICTING` | `UNKNOWN`
- `statusCheckRollup.state` — `SUCCESS` | `PENDING` | `FAILURE` | `ERROR` | `EXPECTED` | null. Field is an object on `PullRequest`; query as `statusCheckRollup { state }`.
- `updatedAt`
- `latestCommit.committedDate` — pulled via `commits(last:1) { nodes { commit { committedDate } } }`. GitHub removed `Commit.pushedDate` in 2023; `committedDate` is the commit author timestamp, which serves the "new commits since X" derivations well (rebases reset it, which is the desired behavior).
- `reviews[]` — state, author, submittedAt
- `reviewRequests[]` — each has `requestedReviewer`, a union of `User | Team | Mannequin | Bot`. Use inline fragments to extract `login` (User/Mannequin/Bot) or `slug` (Team). Bot reviewers exist (Renovate, Dependabot, etc.) and should generally be filtered alongside the §7 ignore list.
- `comments.totalCount` — issue-level conversation comments on the PR.
- `reviewThreads[]` — each has `isResolved`, plus a nested `comments` connection (author + `createdAt`). No scalar exists for unresolved-thread count; aggregate locally as `reviewThreads.filter(t => !t.isResolved).length`.

Derived fields (computed locally from the above):

- `bucket` — computed via the rules in §4.
- `viewerHasReviewed` — true if `reviews[]` contains an entry where `author.login == viewer.login`.
- `viewerLatestReviewSubmittedAt` — max `submittedAt` across the viewer's reviews.
- `needsRereview` — `viewerHasReviewed && latestCommit.committedDate > viewerLatestReviewSubmittedAt`.
- `newCommentsSincePush` — non-self comments (across both issue-level and review-thread comments) with `createdAt > latestCommit.committedDate`.
- `timeSinceActivity` — formatted relative time from `updatedAt`.

## 6. GitHub API

**Auth:** OAuth App Device Flow. The user clicks "Sign in with GitHub" → api calls `https://github.com/login/device/code` with the app's `client_id` + scopes (`repo read:user read:org`; `read:org` is required for the `Team.slug` field surfaced in PR review requests) → user enters the displayed code on github.com/login/device and approves. The api then exchanges the device code for an access token and stores it as an HttpOnly + SameSite=Strict cookie (`prq_access_token`, path `/api`). The `client_id` is read from `PRQ_GITHUB_CLIENT_ID` (apps/api/.env); the api fails fast on startup if it's missing. New OAuth Apps issue long-lived tokens (GitHub retired the per-app "Expire user authorization tokens" toggle), so there is no refresh-token rotation; the cookie just outlives a normal session and is revocable from https://github.com/settings/applications.

**Why OAuth over a PAT:** SAML SSO consent happens once at sign-in instead of per-PAT-per-org, OAuth Apps get org-admin-approved once for all repos (vs. per-repo for fine-grained PATs), and revocation/audit live in the same GitHub UI as every other authorized app. The token's posture is otherwise equivalent: a long-lived bearer stored locally.

**Portability:** Per-machine install. The same codebase runs anywhere; whoever signs in determines whose PRs show up. Sign in with the work account on the work laptop, the personal account on the personal laptop. The `client_id` env var stays the same across machines (it's a public identifier). The `@me` in all search queries resolves to whoever owns the active session.

**Primary queries** (GraphQL search):

- `is:pr is:open author:@me` — my PRs.
- `is:pr is:open review-requested:@me` — PRs needing my review. Includes direct requests _and_ PRs routed via team membership; over-surfacing chosen deliberately over `user-review-requested:@me`, which only matches direct requests.
- `is:pr is:open reviewed-by:@me` — to catch re-review cases.

A single GraphQL request per poll cycle pulls all needed fields, including `statusCheckRollup`, `reviewDecision`, and review/comment timestamps. Avoids N+1 calls.

**Polling:** every 30–60 seconds while the tab is active. TanStack Query handles the polling lifecycle, including refetch-on-window-focus (so tabbing back in triggers an immediate fresh fetch by default) and pausing when the tab is hidden via the `visibilitychange` API.

**Rate limit:** 5,000 points/hr per token (10,000 if the token owner is in a GitHub Enterprise Cloud org). GraphQL cost is not flat 1/query — it's the sum of connection page sizes ÷ 100 (rounded up, minimum 1). A poll fetching 50 PRs with nested `reviews(first:20)` and `reviewThreads(first:20)` runs ~5–10 points. At 30s cadence, even 10 points/poll = 1,200/hr — comfortably under cap. Include `rateLimit { cost remaining resetAt }` in every query and surface it for observability.

## 7. Settings

A minimal settings panel reachable from the dashboard header. Three controls:

- **Sign-in** — shows "Connected as @login" + a "Sign out" button when a session cookie is present, otherwise a "Sign in with GitHub" button that kicks off the OAuth Device Flow inline. Token health is verified by hitting the api's `/user` endpoint (which in turn hits GitHub's `/user`).
- **Polling cadence** — dropdown: 30s, 60s, 2m, 5m. Default 30s.
- **Repo ignore list** — free-text list of `owner/repo` patterns. PRs from matching repos are filtered out before bucketing. Catches the inevitable Dependabot / Renovate flood.

Settings persist locally per-machine. No sync.

## 8. States

Every fetch resolves into a UI state. The map below covers loading, empty, error, and success cases:

| State                            | Trigger                                    | UI behavior                                                                                                                                                         |
| -------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loading                          | Initial fetch, no cached data              | Skeleton rows in each bucket, "Last synced: —"                                                                                                                      |
| Loading (background)             | Refetch with cached data present           | Existing data stays visible, subtle spinner near "Last synced"                                                                                                      |
| Empty                            | Fetch succeeded, no PRs in a bucket        | Bucket header shows `(0)`, body collapses                                                                                                                           |
| Empty (global)                   | Fetch succeeded, zero PRs total            | Friendly empty state: "Nothing in flight. Go ship something."                                                                                                       |
| Session expired/revoked (401)    | Auth failure (token revoked from GitHub)   | Full-page Sign-in page. The api clears the cookie on the 401 response so the next visit goes straight to sign-in without an extra round-trip.                       |
| Error: Rate limited (403 or 429) | GitHub primary or secondary rate limit hit | Banner: "Rate limited. Resuming at HH:MM." Polling pauses until reset. Read `retry-after` if present (secondary limits), else `x-ratelimit-reset` (primary limits). |
| Error: Network                   | Fetch threw                                | Banner: "Can't reach GitHub. Retrying…" TanStack Query handles backoff.                                                                                             |
| Error: Unknown                   | Anything else                              | Banner with the error message and a manual retry button.                                                                                                            |
| Success                          | Fetch returned 200                         | Render buckets, update "Last synced".                                                                                                                               |

TanStack Query gives us most of this for free (loading, error, refetch, retry/backoff). The work is mapping its states to the right UI affordances.

## 9. Notifications

Goal: stop compulsively checking the tab without introducing intrusive OS toasts.

**Approach:** title badge + favicon dot. No browser Notification API in v1.

- `document.title` reflects an unread count: `(3) prq` when the count is non-zero, plain `prq` when zero.
- Favicon swaps to a red-dot variant when count is non-zero, back to default when zero.
- Pinned tabs show just the favicon, so the red dot is the primary signal.

**What counts toward the badge:**

Only PRs in **Needs my review** or **Needs my attention**. Those are the only two buckets where someone is blocked. Drafts, Waiting on others, and Ready to merge do not contribute to the count.

**Implementation note:** a single effect watching the combined count of those two buckets, updating `document.title` and the favicon `<link>` href. Re-runs on every poll cycle.

## 10. Future Considerations

Deferred to keep v1 small:

- Inline row expansion (file changes, full comment threads).
- Auto-merge toggle (call `enablePullRequestAutoMerge` from the UI).
- Browser Notification API toasts on bucket transitions (layer on top of the badge if the badge alone proves insufficient).
- Stacked PR support.
- Open-sourcing as a Graphite alternative for non-stacking users.

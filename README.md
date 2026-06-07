# prq

A PR command center for tracking the GitHub pull requests that matter to you: the ones you authored, the ones waiting on your review, and the ones you've already reviewed. No more losing them in the noise of GitHub notifications.

The product direction is locked in [docs/spec.md](docs/spec.md). The setup below describes the current local development app.

## What it does

- Pulls your open PRs from GitHub in three buckets: **authored by you**, **review requested from you**, **reviewed by you**.
- Bucket-based dashboard so the PRs you care about don't get buried.
- Settings + light/dark theme.
- Current development flow runs locally with GitHub App sign-in and an API-managed session.

## Prerequisites

- **Node.js** `>= 22`
- **pnpm** `10.33.2` (the repo pins this via `packageManager`; `corepack enable` will pick it up)
- **Docker** with Compose
- A **GitHub App** you control:
  1. Create one at https://github.com/settings/apps/new.
  2. Set **Callback URL** to `http://localhost:3001/api/auth/github/callback`.
  3. Set **Setup URL** to `http://localhost:3001/api/auth/github/setup`.
  4. Enable **Redirect on update**.
  5. Keep **Request user authorization (OAuth) during installation** disabled.
  6. Grant read-only repository permissions for Checks, Commit statuses, Contents, and Pull requests.
  7. Set **Webhook URL** to your HTTPS tunnel for `http://localhost:3001/api/webhooks/github`.
  8. Set webhook **Content type** to `application/json` and choose a webhook secret.
  9. Subscribe to Installation, Installation repositories, Repository, Pull request, and Pull request review events.
  10. Copy the **Client ID**, generate a **Client secret**, and add the webhook secret to `apps/api/.env`.

## Setup

```sh
git clone <your-fork-or-this-repo>.git
cd prq
pnpm install
cp apps/api/.env.example apps/api/.env
# paste your GitHub App Client ID and Client secret into apps/api/.env
docker compose up -d postgres
pnpm db:migrate
```

## Run

Open two terminals.

```sh
# terminal 1: api on :3001
pnpm dev:api
```

```sh
# terminal 2: web on :5173
pnpm dev:web
```

Then open http://localhost:5173 and click **Sign in with GitHub**.

> If you want to hit `/api/*` directly with `curl`, add `-H "Origin: http://localhost:3001"` so Hono's CSRF middleware accepts the request. Browsers set Origin automatically via the Vite proxy.

## Repo layout

```
apps/
  api/      Hono server that talks to the GitHub GraphQL API
  web/      React + Vite dashboard (TanStack Router/Query, Tailwind)
packages/
  shared/   Zod schemas and types shared between api and web
```

## Scripts

| Command          | What it does                           |
| ---------------- | -------------------------------------- |
| `pnpm dev:api`   | Start the api in watch mode on :3001   |
| `pnpm dev:web`   | Start the web app in dev mode on :5173 |
| `pnpm build`     | Build the web app for production       |
| `pnpm typecheck` | Run TypeScript across all workspaces   |
| `pnpm test`      | Run tests across all workspaces        |
| `pnpm lint`      | Lint                                   |

Run the opt-in Compose-backed webhook persistence test with
`pnpm --filter @prq/api test:webhook-db`. It automatically provisions and
migrates the isolated `prq_test` database.

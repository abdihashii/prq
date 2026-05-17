# prq

A local tool for tracking the GitHub pull requests that matter to you: the ones you authored, the ones waiting on your review, and the ones you've already reviewed. No more losing them in the noise of GitHub notifications.

Not deployed anywhere. Clone or fork this repo and run it locally.

## What it does

- Pulls your open PRs from GitHub in three buckets: **authored by you**, **review requested from you**, **reviewed by you**.
- Bucket-based dashboard so the PRs you care about don't get buried.
- Settings + light/dark theme.
- Runs entirely on your machine. Your GitHub token never leaves your environment.

## Prerequisites

- **Node.js** `>= 22`
- **pnpm** `10.33.2` (the repo pins this via `packageManager`; `corepack enable` will pick it up)
- A **GitHub OAuth App** you control (used for the Sign-in-with-GitHub Device Flow):
  1. Visit https://github.com/settings/applications/new
  2. **Application name:** anything (e.g. `prq`). **Homepage URL:** `http://localhost:5173`. **Authorization callback URL:** `http://localhost:5173/` (required by the form but unused by Device Flow).
  3. Check **Enable Device Flow**, click **Register application**.
  4. Copy the **Client ID** shown at the top of the resulting page.

  Scopes prq requests at sign-in: `repo`, `read:user`, `read:org`. The token is stored as an HttpOnly cookie on the local api and is revocable any time at https://github.com/settings/applications.

## Setup

```sh
git clone <your-fork-or-this-repo>.git
cd prq
pnpm install
cp apps/api/.env.example apps/api/.env
# paste your OAuth App's Client ID into apps/api/.env as PRQ_GITHUB_CLIENT_ID
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

Then open http://localhost:5173, click **Sign in with GitHub**, enter the displayed code on github.com/login/device, and you're in.

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

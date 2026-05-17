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
- A **GitHub Personal Access Token (classic)** with scopes:
  - `repo` (required to read PRs in private repos; use `public_repo` instead if you only care about public PRs)
  - `read:user`

  Create one at https://github.com/settings/tokens. You'll paste it into the app on first run; it's stored as an HTTP-only cookie on the local api.

## Setup

```sh
git clone <your-fork-or-this-repo>.git
cd prq
pnpm install
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

Then open http://localhost:5173, paste your GitHub PAT when prompted, and you're in.

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

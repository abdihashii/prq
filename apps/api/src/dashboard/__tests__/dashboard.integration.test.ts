import { Hono } from 'hono'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { hashSessionId } from '../../auth/session'
import {
  closeDatabase,
  createDatabase,
  type DatabaseClient,
  TEST_DATABASE_URL,
} from '../../db'
import {
  githubInstallations,
  githubSessions,
  githubUsers,
  pullRequestReviewRequests,
  pullRequestReviews,
  pullRequests,
  repositories,
} from '../../db/schema'
import { createDrizzleWebhookStore } from '../../github/webhook/store'
import { emptySyncPlan } from '../../github/webhook/types'
import { prs } from '../../routes/prs'
import { createDashboardService, createDrizzleDashboardStore } from '../dashboard'

const RUN_INTEGRATION = process.env['PRQ_DASHBOARD_DB_INTEGRATION'] === '1'
const NOW = new Date('2026-06-07T12:00:00.000Z')
const DATABASE_URL = process.env['PRQ_DASHBOARD_TEST_DATABASE_URL'] ?? TEST_DATABASE_URL
const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../../drizzle', import.meta.url))

describe.skipIf(!RUN_INTEGRATION)('database-backed dashboard integration', () => {
  let client: DatabaseClient

  beforeAll(async () => {
    await ensureTestDatabase(DATABASE_URL)
    client = createDatabase({ url: DATABASE_URL, ssl: false, maxConnections: 4 })
    await migrate(client.db, { migrationsFolder: MIGRATIONS_FOLDER })
  })

  beforeEach(async () => {
    await cleanTestRows(client)
    await seedStoredDashboard(client)
  })

  afterAll(async () => {
    await cleanTestRows(client)
    await closeDatabase()
    await client?.close()
  })

  it('projects only open viewer state from active installed repositories', async () => {
    const dashboard = await createDashboardService({
      store: createDrizzleDashboardStore(client.db),
      now: () => NOW,
    }).getDashboard({
      viewer: { githubId: 'U_haji', login: 'haji' },
      repositoryAllowlist: new Set(['acme/rocket']),
    })

    expect(dashboard.buckets.waiting).toMatchObject([{
      kind: 'stack',
      root: {
        pr: { id: 'PR_parent' },
        children: [{ pr: { id: 'PR_child' }, children: [] }],
      },
    }])
    expect(dashboard.buckets.review).toMatchObject([
      { kind: 'pr', pr: { id: 'PR_rereview', needsRereview: true } },
      { kind: 'pr', pr: { id: 'PR_requested', viewerIsRequestedReviewer: true } },
    ])
    expect(dashboard.trackableRepos).toEqual([
      { owner: 'acme', name: 'rocket', prCount: 4 },
      { owner: 'haji', name: 'dotfiles', prCount: 0 },
    ])
    expect(JSON.stringify(dashboard)).not.toContain('inactive')
    expect(JSON.stringify(dashboard)).not.toContain('closed')
  })

  it('serves the stored projection through an authenticated route without GitHub reads', async () => {
    const app = new Hono().route('/api', prs)
    const res = await app.request('/api/prs?repos=acme%2Frocket', {
      headers: { cookie: 'prq_session=session-plain' },
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      viewerLogin: 'haji',
      buckets: {
        review: [
          { kind: 'pr', pr: { id: 'PR_rereview' } },
          { kind: 'pr', pr: { id: 'PR_requested' } },
        ],
        waiting: [{ kind: 'stack', root: { pr: { id: 'PR_parent' } } }],
      },
    })
  })

  it('projects dashboard state written through webhook ingestion storage', async () => {
    await cleanTestRows(client)
    const webhookStore = createDrizzleWebhookStore(client.db)
    await webhookStore.reserveDelivery({
      deliveryId: 'dashboard-smoke',
      event: 'pull_request',
      action: 'opened',
      payload: { action: 'opened' },
    })
    await webhookStore.applyDelivery('dashboard-smoke', {
      ...emptySyncPlan(),
      installations: [{
        githubInstallationId: 'I_webhook',
        accountGithubId: 'A_acme',
        accountLogin: 'acme',
        accountType: 'Organization',
        active: true,
      }],
      repositories: [{
        githubRepositoryId: 'R_webhook',
        githubInstallationId: 'I_webhook',
        owner: 'acme',
        name: 'webhook-state',
        fullName: 'acme/webhook-state',
      }],
      pullRequests: [{
        pullRequest: {
          githubPullRequestId: 'PR_webhook',
          githubRepositoryId: 'R_webhook',
          number: 42,
          title: 'Webhook-ingested PR',
          url: 'https://github.com/acme/webhook-state/pull/42',
          authorLogin: 'haji',
          baseRefName: 'main',
          headRefName: 'feature/webhook',
          headRepositoryOwner: 'acme',
          headRepositoryName: 'webhook-state',
          isDraft: false,
          state: 'OPEN',
          githubUpdatedAt: NOW,
          closedAt: null,
          mergedAt: null,
        },
      }],
    }, NOW)

    const dashboard = await createDashboardService({
      store: createDrizzleDashboardStore(client.db),
      now: () => NOW,
    }).getDashboard({
      viewer: { githubId: 'U_haji', login: 'haji' },
      repositoryAllowlist: new Set(['acme/webhook-state']),
    })

    expect(dashboard.buckets.waiting).toMatchObject([
      { kind: 'pr', pr: { id: 'PR_webhook', title: 'Webhook-ingested PR' } },
    ])
  })
})

async function seedStoredDashboard(client: DatabaseClient) {
  await client.db.insert(githubUsers).values({ githubId: 'U_haji', login: 'haji' })
  await client.db.insert(githubSessions).values({
    sessionIdHash: hashSessionId('session-plain'),
    githubUserId: 'U_haji',
    accessToken: 'stored-access',
    expiresAt: new Date('2030-01-01T00:00:00.000Z'),
  })
  await client.db.insert(githubInstallations).values([
    {
      githubInstallationId: 'I_active',
      accountGithubId: 'A_acme',
      accountLogin: 'acme',
      accountType: 'Organization',
      active: true,
    },
    {
      githubInstallationId: 'I_owned',
      accountGithubId: 'U_haji',
      accountLogin: 'stale-haji',
      accountType: 'User',
      active: true,
    },
    {
      githubInstallationId: 'I_inactive',
      accountGithubId: 'A_inactive',
      accountLogin: 'inactive',
      accountType: 'Organization',
      active: false,
    },
  ])
  await client.db.insert(repositories).values([
    {
      githubRepositoryId: 'R_active',
      githubInstallationId: 'I_active',
      owner: 'acme',
      name: 'rocket',
      fullName: 'acme/rocket',
    },
    {
      githubRepositoryId: 'R_owned',
      githubInstallationId: 'I_owned',
      owner: 'haji',
      name: 'dotfiles',
      fullName: 'haji/dotfiles',
    },
    {
      githubRepositoryId: 'R_inactive',
      githubInstallationId: 'I_inactive',
      owner: 'inactive',
      name: 'secret',
      fullName: 'inactive/secret',
    },
  ])
  await client.db.insert(pullRequests).values([
    storedPr('PR_parent', 'R_active', 1, 'haji', 'main', 'feature/parent', 'OPEN', 6),
    storedPr('PR_child', 'R_active', 2, 'haji', 'feature/parent', 'feature/child', 'OPEN', 5),
    storedPr('PR_requested', 'R_active', 3, 'teammate', 'main', 'feature/requested', 'OPEN', 4),
    {
      ...storedPr('PR_rereview', 'R_active', 4, 'teammate', 'main', 'feature/rereview', 'OPEN', 3),
      latestCommitCommittedAt: new Date('2026-06-07T11:00:00.000Z'),
    },
    storedPr('PR_reviewed_done', 'R_active', 5, 'teammate', 'main', 'feature/done', 'OPEN', 2),
    storedPr('PR_closed', 'R_active', 6, 'haji', 'main', 'feature/closed', 'CLOSED', 1),
    storedPr('PR_inactive', 'R_inactive', 7, 'haji', 'main', 'feature/inactive', 'OPEN', 0),
  ])
  await client.db.insert(pullRequestReviewRequests).values({
    githubPullRequestId: 'PR_requested',
    reviewerKind: 'User',
    reviewerHandle: 'HAJI',
  })
  await client.db.insert(pullRequestReviews).values([
    {
      githubReviewId: 'REV_rereview',
      githubPullRequestId: 'PR_rereview',
      authorLogin: 'haji',
      state: 'APPROVED',
      submittedAt: new Date('2026-06-07T10:00:00.000Z'),
    },
    {
      githubReviewId: 'REV_done',
      githubPullRequestId: 'PR_reviewed_done',
      authorLogin: 'haji',
      state: 'APPROVED',
      submittedAt: new Date('2026-06-07T10:00:00.000Z'),
    },
  ])
}

function storedPr(
  id: string,
  repositoryId: string,
  number: number,
  authorLogin: string,
  baseRefName: string,
  headRefName: string,
  state: 'OPEN' | 'CLOSED',
  minutes: number,
) {
  return {
    githubPullRequestId: id,
    githubRepositoryId: repositoryId,
    number,
    title: id,
    url: `https://github.com/acme/rocket/pull/${number}`,
    authorLogin,
    baseRefName,
    headRefName,
    headRepositoryOwner: repositoryId === 'R_inactive' ? 'inactive' : 'acme',
    headRepositoryName: repositoryId === 'R_inactive' ? 'secret' : 'rocket',
    isDraft: false,
    state,
    githubUpdatedAt: new Date(NOW.getTime() - minutes * 60_000),
    closedAt: state === 'CLOSED' ? NOW : null,
    mergedAt: null,
  }
}

async function cleanTestRows(client: DatabaseClient) {
  await client.db.delete(pullRequestReviews)
  await client.db.delete(pullRequestReviewRequests)
  await client.db.delete(pullRequests)
  await client.db.delete(repositories)
  await client.db.delete(githubSessions)
  await client.db.delete(githubUsers)
  await client.db.delete(githubInstallations)
}

async function ensureTestDatabase(url: string) {
  const databaseUrl = new URL(url)
  const databaseName = decodeURIComponent(databaseUrl.pathname.slice(1))
  if (!databaseName) throw new Error('Dashboard integration database URL must include a database')

  const adminUrl = new URL(databaseUrl)
  adminUrl.pathname = '/postgres'
  const sql = postgres(adminUrl.toString(), { max: 1, ssl: false })
  try {
    const [existing] = await sql<{ exists: boolean }[]>`
      select exists(select 1 from pg_database where datname = ${databaseName}) as exists
    `
    if (!existing?.exists) {
      await sql.unsafe(`create database "${databaseName.replaceAll('"', '""')}"`)
    }
  }
  finally {
    await sql.end({ timeout: 5 })
  }
}

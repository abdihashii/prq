import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { eq } from 'drizzle-orm'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { hashSessionId } from '../../auth/session'
import {
  closeDatabase,
  createDatabase,
  type DatabaseClient,
  TEST_DATABASE_URL,
} from '../../db'
import {
  autoRetargetEvents,
  githubInstallations,
  githubSessions,
  githubUserRepositories,
  githubUsers,
  pullRequestReviewRequests,
  pullRequestReviews,
  pullRequests,
  repositories,
  webhookDeliveries,
} from '../../db/schema'
import { createDrizzleWebhookStore } from '../../github/webhook/store'
import { emptySyncPlan } from '../../github/webhook/types'
import { createDashboardService, createDrizzleDashboardStore } from '../dashboard'
import {
  createDrizzleDashboardAuthorizationStore,
  createDrizzleDashboardReconciliationStore,
  createGitHubDashboardAuthorization,
} from '../github'

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

  it('does not expose an active private repository without viewer repository access', async () => {
    const dashboard = await createDashboardService({
      store: createDrizzleDashboardStore(client.db),
      now: () => NOW,
    }).getDashboard({
      viewer: { githubId: 'U_haji', login: 'haji' },
      repositoryAllowlist: new Set(['acme/unauthorized']),
    })

    expect(dashboard.trackableRepos).not.toContainEqual(expect.objectContaining({
      owner: 'acme',
      name: 'unauthorized',
    }))
    expect(JSON.stringify(dashboard.buckets)).not.toContain('PR_unauthorized')
  })

  it('replaces viewer repository access exactly when GitHub revokes it', async () => {
    const authorization = createGitHubDashboardAuthorization({
      store: createDrizzleDashboardAuthorizationStore(client.db),
      fetch: vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input))
        if (url.pathname === '/user/installations') {
          return jsonResponse({
            total_count: 1,
            installations: [{
              id: 'I_active',
              account: { id: 'A_acme', login: 'acme', type: 'Organization' },
              suspended_at: null,
            }],
          })
        }
        return jsonResponse({ total_count: 0, repositories: [] })
      }),
    })

    await authorization.refresh({ githubId: 'U_haji', login: 'haji', accessToken: 'token' }, NOW)
    const dashboard = await createDashboardService({
      store: createDrizzleDashboardStore(client.db),
      now: () => NOW,
    }).getDashboard({
      viewer: { githubId: 'U_haji', login: 'haji' },
      repositoryAllowlist: new Set(['acme/rocket']),
    })

    expect(dashboard.trackableRepos).toEqual([])
    expect(dashboard.buckets.waiting).toEqual([])
    expect(await client.db.select({
      active: githubInstallations.active,
    }).from(githubInstallations).where(eq(
      githubInstallations.githubInstallationId,
      'I_owned',
    ))).toEqual([{ active: true }])
  })

  it('stamps the scope refresh timestamp and serves the next refresh from the DB', async () => {
    const crawlFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.pathname === '/user/installations') {
        return jsonResponse({
          total_count: 1,
          installations: [{
            id: 'I_active',
            account: { id: 'A_acme', login: 'acme', type: 'Organization' },
            suspended_at: null,
          }],
        })
      }
      return jsonResponse({
        total_count: 1,
        repositories: [{
          node_id: 'R_active',
          name: 'rocket',
          full_name: 'acme/rocket',
          owner: { login: 'acme' },
          default_branch: 'main',
          private: false,
          archived: false,
        }],
      })
    })
    const principal = { githubId: 'U_haji', login: 'haji', accessToken: 'token' }

    // First refresh: seeded stamp is null, so it crawls, writes the snapshot,
    // and stamps the refresh timestamp.
    await createGitHubDashboardAuthorization({
      store: createDrizzleDashboardAuthorizationStore(client.db),
      fetch: crawlFetch,
    }).refresh(principal, NOW)

    expect(await client.db.select({
      refreshedAt: githubUsers.authorizedScopeRefreshedAt,
    }).from(githubUsers).where(eq(githubUsers.githubId, 'U_haji')))
      .toEqual([{ refreshedAt: NOW }])

    // Second refresh inside the window: must read from the DB without crawling.
    const gatedFetch = vi.fn(async () => jsonResponse({ message: 'should not be called' }, 500))
    const repositories = await createGitHubDashboardAuthorization({
      store: createDrizzleDashboardAuthorizationStore(client.db),
      fetch: gatedFetch,
    }).refresh(principal, NOW)

    expect(gatedFetch).not.toHaveBeenCalled()
    expect(repositories.map(repository => `${repository.owner}/${repository.name}`))
      .toEqual(['acme/rocket'])
  })

  it('persists rich reconciliation state and advances the repository timestamp atomically', async () => {
    const reconciliationStore = createDrizzleDashboardReconciliationStore(client.db)
    await reconciliationStore.persist({
      repository: {
        githubRepositoryId: 'R_active',
        githubInstallationId: 'I_active',
        owner: 'acme',
        name: 'rocket',
        dashboardReconciledAt: null,
      },
      pullRequests: [{
        pullRequest: {
          id: 'PR_reconciled',
          number: 20,
          title: 'Reconciled PR',
          url: 'https://github.com/acme/rocket/pull/20',
          author: { login: 'teammate' },
          baseRefName: 'main',
          headRefName: 'feature/reconciled',
          headRepository: { owner: { login: 'acme' }, name: 'rocket' },
          isDraft: false,
          state: 'OPEN',
          reviewDecision: 'REVIEW_REQUIRED',
          mergeable: 'MERGEABLE',
          statusCheckRollup: { state: 'SUCCESS' },
          updatedAt: new Date('2026-06-07T11:45:00.000Z'),
          closedAt: null,
          mergedAt: null,
          commits: {
            totalCount: 7,
            nodes: [{ commit: { committedDate: new Date('2026-06-07T11:30:00.000Z') } }],
          },
          comments: { totalCount: 9 },
          reviewRequests: {
            nodes: [],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
          reviews: {
            nodes: [],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
          reviewThreads: {
            nodes: [],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
        reviewRequests: [{
          requestedReviewer: { __typename: 'User', login: 'haji' },
        }],
        reviews: [{
          id: 'REV_reconciled',
          author: { login: 'haji' },
          state: 'APPROVED',
          submittedAt: new Date('2026-06-07T10:00:00.000Z'),
        }],
        unresolvedThreadCount: 2,
      }],
      missingStates: [{
        id: 'PR_parent',
        state: 'MERGED',
        updatedAt: NOW,
        closedAt: NOW,
        mergedAt: NOW,
      }],
      now: NOW,
    })

    const [repository] = await client.db.select({
      dashboardReconciledAt: repositories.dashboardReconciledAt,
    }).from(repositories).where(eq(repositories.githubRepositoryId, 'R_active'))
    expect(repository?.dashboardReconciledAt).toEqual(NOW)

    const dashboard = await createDashboardService({
      store: createDrizzleDashboardStore(client.db),
      now: () => NOW,
    }).getDashboard({
      viewer: { githubId: 'U_haji', login: 'haji' },
      repositoryAllowlist: new Set(['acme/rocket']),
    })
    expect(dashboard.buckets.review).toContainEqual(expect.objectContaining({
      kind: 'pr',
      pr: expect.objectContaining({
        id: 'PR_reconciled',
        viewerIsRequestedReviewer: true,
        viewerHasReviewed: true,
        needsRereview: true,
        commitsTotalCount: 7,
        commentsTotalCount: 9,
        unresolvedThreadCount: 2,
      }),
    }))
    expect(JSON.stringify(dashboard.buckets)).not.toContain('PR_parent')
  })

  it('projects dashboard state written through webhook ingestion storage', async () => {
    await cleanTestRows(client)
    await client.db.insert(githubUsers).values({ githubId: 'U_haji', login: 'haji' })
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
    await client.db.insert(githubUserRepositories).values({
      githubUserId: 'U_haji',
      githubRepositoryId: 'R_webhook',
    })

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

  it('projects only successful auto-retarget history through the existing indicator contract', async () => {
    await client.db.insert(webhookDeliveries).values([
      {
        deliveryId: 'retarget-success',
        event: 'pull_request',
        action: 'closed',
        payload: {},
        status: 'processed',
      },
      {
        deliveryId: 'retarget-failed',
        event: 'pull_request',
        action: 'closed',
        payload: {},
        status: 'processed',
      },
    ])
    await client.db.insert(autoRetargetEvents).values([
      {
        githubPullRequestId: 'PR_child',
        parentGithubPullRequestId: 'PR_parent',
        deliveryId: 'retarget-success',
        previousBaseRefName: 'feature/older-parent',
        nextBaseRefName: 'feature/parent',
        status: 'succeeded',
      },
      {
        githubPullRequestId: 'PR_parent',
        deliveryId: 'retarget-failed',
        previousBaseRefName: 'feature/failed-parent',
        nextBaseRefName: 'main',
        status: 'failed',
        errorMessage: 'GitHub unavailable',
      },
    ])

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
        children: [{
          pr: {
            id: 'PR_child',
            autoRetarget: { previousBaseRefName: 'feature/older-parent' },
          },
        }],
      },
    }])
    expect(JSON.stringify(dashboard.buckets)).not.toContain('feature/failed-parent')
  })

  it('lists active, unarchived, stale repositories oldest-first within the limit', async () => {
    const store = createDrizzleDashboardReconciliationStore(client.db)
    const hourAgo = new Date(NOW.getTime() - 60 * 60 * 1000)
    const twoHoursAgo = new Date(NOW.getTime() - 2 * 60 * 60 * 1000)

    // R_owned: never reconciled (most stale). R_active: reconciled an hour ago.
    // R_unauthorized: older still but archived (excluded). R_inactive: stale but on
    // an inactive installation (excluded).
    await client.db.update(repositories).set({ dashboardReconciledAt: null })
      .where(eq(repositories.githubRepositoryId, 'R_owned'))
    await client.db.update(repositories).set({ dashboardReconciledAt: hourAgo })
      .where(eq(repositories.githubRepositoryId, 'R_active'))
    await client.db.update(repositories).set({ dashboardReconciledAt: twoHoursAgo, archived: true })
      .where(eq(repositories.githubRepositoryId, 'R_unauthorized'))
    await client.db.update(repositories).set({ dashboardReconciledAt: null })
      .where(eq(repositories.githubRepositoryId, 'R_inactive'))

    const stale = await store.listStaleRepositories({ staleBefore: NOW, limit: 10 })
    expect(stale.map(repository => repository.githubRepositoryId)).toEqual(['R_owned', 'R_active'])
    expect(stale[0]).toMatchObject({
      githubInstallationId: 'I_owned',
      owner: 'haji',
      name: 'dotfiles',
    })

    const limited = await store.listStaleRepositories({ staleBefore: NOW, limit: 1 })
    expect(limited.map(repository => repository.githubRepositoryId)).toEqual(['R_owned'])
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
      dashboardReconciledAt: NOW,
    },
    {
      githubRepositoryId: 'R_owned',
      githubInstallationId: 'I_owned',
      owner: 'haji',
      name: 'dotfiles',
      fullName: 'haji/dotfiles',
      dashboardReconciledAt: NOW,
    },
    {
      githubRepositoryId: 'R_inactive',
      githubInstallationId: 'I_inactive',
      owner: 'inactive',
      name: 'secret',
      fullName: 'inactive/secret',
      dashboardReconciledAt: NOW,
    },
    {
      githubRepositoryId: 'R_unauthorized',
      githubInstallationId: 'I_active',
      owner: 'acme',
      name: 'unauthorized',
      fullName: 'acme/unauthorized',
      private: true,
      dashboardReconciledAt: NOW,
    },
  ])
  await client.db.insert(githubUserRepositories).values([
    { githubUserId: 'U_haji', githubRepositoryId: 'R_active' },
    { githubUserId: 'U_haji', githubRepositoryId: 'R_owned' },
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
    storedPr('PR_unauthorized', 'R_unauthorized', 8, 'haji', 'main', 'feature/secret', 'OPEN', 0),
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
  await client.db.delete(autoRetargetEvents)
  await client.db.delete(pullRequestReviews)
  await client.db.delete(pullRequestReviewRequests)
  await client.db.delete(pullRequests)
  await client.db.delete(webhookDeliveries)
  await client.db.delete(githubUserRepositories)
  await client.db.delete(repositories)
  await client.db.delete(githubSessions)
  await client.db.delete(githubUsers)
  await client.db.delete(githubInstallations)
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
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

import { eq, inArray } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createDatabase,
  type DatabaseClient,
  TEST_DATABASE_URL,
} from '../../db'
import {
  githubInstallations,
  pullRequestReviewRequests,
  pullRequestReviews,
  pullRequests,
  repositories,
  webhookDeliveries,
} from '../../db/schema'
import { createDrizzleWebhookStore } from '../webhook/store'
import { emptySyncPlan, type WebhookSyncPlan } from '../webhook/types'

const RUN_INTEGRATION = process.env['PRQ_WEBHOOK_DB_INTEGRATION'] === '1'
const NOW = new Date('2026-06-06T12:00:00.000Z')
const DATABASE_URL = process.env['PRQ_WEBHOOK_TEST_DATABASE_URL'] ?? TEST_DATABASE_URL
const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../../drizzle', import.meta.url))

describe.skipIf(!RUN_INTEGRATION)('Drizzle GitHub webhook store integration', () => {
  let client: DatabaseClient

  beforeAll(async () => {
    await ensureTestDatabase(DATABASE_URL)
    client = createDatabase({
      url: DATABASE_URL,
      ssl: false,
      maxConnections: 4,
    })
    await migrate(client.db, { migrationsFolder: MIGRATIONS_FOLDER })
  })

  beforeEach(async () => {
    await cleanTestRows(client)
  })

  afterAll(async () => {
    await cleanTestRows(client)
    await client?.close()
  })

  it('persists ordered state atomically and treats processed redelivery as duplicate', async () => {
    const store = createDrizzleWebhookStore(client.db)
    await store.reserveDelivery(delivery('delivery-success'))

    await expect(store.applyDelivery('delivery-success', completePlan(), NOW))
      .resolves.toBe('processed')
    await expect(store.applyDelivery('delivery-success', completePlan(), NOW))
      .resolves.toBe('duplicate')

    expect(await client.db.select().from(githubInstallations)
      .where(eq(githubInstallations.githubInstallationId, '42'))).toHaveLength(1)
    expect(await client.db.select().from(repositories)
      .where(eq(repositories.githubRepositoryId, 'R_repo'))).toHaveLength(1)
    expect(await client.db.select().from(pullRequests)
      .where(eq(pullRequests.githubPullRequestId, 'PR_one'))).toHaveLength(1)
    expect(await client.db.select().from(pullRequestReviewRequests)
      .where(eq(pullRequestReviewRequests.githubPullRequestId, 'PR_one'))).toHaveLength(1)
    expect(await client.db.select().from(pullRequestReviews)
      .where(eq(pullRequestReviews.githubReviewId, 'PRR_one'))).toHaveLength(1)
    expect(await deliveryStatus(client, 'delivery-success')).toMatchObject({
      status: 'processed',
      githubInstallationId: '42',
      githubRepositoryId: 'R_repo',
      errorMessage: null,
    })
  })

  it('rolls back all state writes and permits a failed delivery retry', async () => {
    const store = createDrizzleWebhookStore(client.db)
    await store.reserveDelivery(delivery('delivery-retry'))
    const invalid = completePlan()
    invalid.reviews[0] = {
      ...invalid.reviews[0]!,
      githubPullRequestId: 'PR_missing',
    }

    await expect(store.applyDelivery('delivery-retry', invalid, NOW)).rejects.toThrow()
    expect(await client.db.select().from(githubInstallations)
      .where(eq(githubInstallations.githubInstallationId, '42'))).toHaveLength(0)
    expect(await deliveryStatus(client, 'delivery-retry')).toMatchObject({ status: 'received' })

    await store.markDeliveryFailed('delivery-retry', new Error('x'.repeat(2000)), NOW)
    expect(await deliveryStatus(client, 'delivery-retry')).toMatchObject({
      status: 'failed',
      errorMessage: 'x'.repeat(1000),
    })

    await expect(store.applyDelivery('delivery-retry', completePlan(), NOW))
      .resolves.toBe('processed')
  })

  it('protects newer PRs and complete review requests from stale snapshots', async () => {
    const store = createDrizzleWebhookStore(client.db)
    await store.reserveDelivery(delivery('delivery-new'))
    await store.applyDelivery('delivery-new', completePlan(), NOW)

    const stale = completePlan()
    stale.pullRequests[0] = {
      pullRequest: {
        ...stale.pullRequests[0]!.pullRequest,
        title: 'stale title',
        githubUpdatedAt: new Date('2026-06-05T12:00:00.000Z'),
      },
      reviewRequests: [{ reviewerKind: 'Team', reviewerHandle: 'stale-team' }],
    }
    await store.reserveDelivery(delivery('delivery-stale'))
    await store.applyDelivery('delivery-stale', stale, NOW)

    const [pullRequest] = await client.db.select().from(pullRequests)
      .where(eq(pullRequests.githubPullRequestId, 'PR_one'))
    expect(pullRequest?.title).toBe('Current title')
    expect(await client.db.select().from(pullRequestReviewRequests)
      .where(eq(pullRequestReviewRequests.githubPullRequestId, 'PR_one'))).toMatchObject([
      { reviewerHandle: 'reviewer', reviewerKind: 'User' },
    ])
  })

  it('preserves fields that a webhook snapshot cannot authoritatively provide', async () => {
    const store = createDrizzleWebhookStore(client.db)
    await store.reserveDelivery(delivery('delivery-current'))
    await store.applyDelivery('delivery-current', completePlan(), NOW)
    const committedAt = new Date('2026-06-06T10:30:00.000Z')
    await client.db.update(pullRequests).set({
      reviewDecision: 'APPROVED',
      statusCheckRollupState: 'SUCCESS',
      latestCommitCommittedAt: committedAt,
      unresolvedThreadCount: 7,
      mergeable: 'CONFLICTING',
      commitsTotalCount: 20,
      commentsTotalCount: 30,
    }).where(eq(pullRequests.githubPullRequestId, 'PR_one'))
    const suspendedAt = new Date('2026-06-06T10:00:00.000Z')
    await client.db.update(githubInstallations).set({
      active: false,
      suspendedAt,
    }).where(eq(githubInstallations.githubInstallationId, '42'))
    await client.db.update(repositories).set({
      githubInstallationId: null,
    }).where(eq(repositories.githubRepositoryId, 'R_repo'))

    const partial = completePlan()
    partial.installations[0] = {
      ...partial.installations[0]!,
      active: undefined,
      suspendedAt: undefined,
    }
    partial.pullRequests[0] = {
      pullRequest: {
        ...partial.pullRequests[0]!.pullRequest,
        title: 'Updated title',
        githubUpdatedAt: new Date('2026-06-06T11:30:00.000Z'),
        mergeable: undefined,
        commitsTotalCount: undefined,
        commentsTotalCount: undefined,
      },
    }
    await store.reserveDelivery(delivery('delivery-partial'))
    await store.applyDelivery('delivery-partial', partial, NOW)

    const [pullRequest] = await client.db.select().from(pullRequests)
      .where(eq(pullRequests.githubPullRequestId, 'PR_one'))
    expect(pullRequest).toMatchObject({
      title: 'Updated title',
      reviewDecision: 'APPROVED',
      statusCheckRollupState: 'SUCCESS',
      latestCommitCommittedAt: committedAt,
      unresolvedThreadCount: 7,
      mergeable: 'CONFLICTING',
      commitsTotalCount: 20,
      commentsTotalCount: 30,
    })
    expect(await client.db.select().from(githubInstallations)
      .where(eq(githubInstallations.githubInstallationId, '42'))).toMatchObject([{
      active: false,
      suspendedAt,
    }])
    expect(await client.db.select().from(repositories)
      .where(eq(repositories.githubRepositoryId, 'R_repo'))).toMatchObject([{
      githubInstallationId: null,
    }])
  })

  it('reconciles a detached repository when its former name is reused', async () => {
    const store = createDrizzleWebhookStore(client.db)
    await store.reserveDelivery(delivery('delivery-original-repository'))
    await store.applyDelivery('delivery-original-repository', completePlan(), NOW)
    await client.db.update(repositories).set({
      githubInstallationId: null,
    }).where(eq(repositories.githubRepositoryId, 'R_repo'))

    const replacement = completePlan()
    replacement.repositories[0] = {
      ...replacement.repositories[0]!,
      githubRepositoryId: 'R_replacement',
    }
    replacement.attachedRepositories = [{
      githubRepositoryId: 'R_replacement',
      githubInstallationId: '42',
    }]
    replacement.pullRequests = []
    replacement.reviews = []

    await store.reserveDelivery(delivery('delivery-replacement-repository'))
    await expect(store.applyDelivery('delivery-replacement-repository', replacement, NOW))
      .resolves.toBe('processed')

    const rows = await client.db.select({
      githubRepositoryId: repositories.githubRepositoryId,
      name: repositories.name,
      githubInstallationId: repositories.githubInstallationId,
    }).from(repositories).where(inArray(repositories.githubRepositoryId, [
      'R_repo',
      'R_replacement',
    ]))
    expect(rows).toEqual(expect.arrayContaining([
      {
        githubRepositoryId: 'R_repo',
        name: 'rocket#historical-R_repo',
        githubInstallationId: null,
      },
      {
        githubRepositoryId: 'R_replacement',
        name: 'rocket',
        githubInstallationId: '42',
      },
    ]))
    expect(await client.db.select({
      githubRepositoryId: pullRequests.githubRepositoryId,
    }).from(pullRequests).where(eq(pullRequests.githubPullRequestId, 'PR_one')))
      .toEqual([{ githubRepositoryId: 'R_repo' }])
  })

  it('reconciles repository history retained under an inactive installation', async () => {
    const store = createDrizzleWebhookStore(client.db)
    await store.reserveDelivery(delivery('delivery-inactive-original'))
    await store.applyDelivery('delivery-inactive-original', completePlan(), NOW)
    await client.db.update(githubInstallations).set({
      active: false,
    }).where(eq(githubInstallations.githubInstallationId, '42'))

    const replacement = completePlan()
    replacement.installations[0] = {
      ...replacement.installations[0]!,
      githubInstallationId: '43',
      accountGithubId: '8',
    }
    replacement.repositories[0] = {
      ...replacement.repositories[0]!,
      githubRepositoryId: 'R_replacement',
      githubInstallationId: '43',
    }
    replacement.attachedRepositories = [{
      githubRepositoryId: 'R_replacement',
      githubInstallationId: '43',
    }]
    replacement.pullRequests = []
    replacement.reviews = []

    await store.reserveDelivery(delivery('delivery-inactive-replacement'))
    await expect(store.applyDelivery('delivery-inactive-replacement', replacement, NOW))
      .resolves.toBe('processed')

    expect(await client.db.select({
      githubRepositoryId: repositories.githubRepositoryId,
      name: repositories.name,
    }).from(repositories).where(inArray(repositories.githubRepositoryId, [
      'R_repo',
      'R_replacement',
    ]))).toEqual(expect.arrayContaining([
      { githubRepositoryId: 'R_repo', name: 'rocket#historical-R_repo' },
      { githubRepositoryId: 'R_replacement', name: 'rocket' },
    ]))
  })

  it('applies account-less installation lifecycle updates to existing rows', async () => {
    const store = createDrizzleWebhookStore(client.db)
    await store.reserveDelivery(delivery('delivery-installation-created'))
    await store.applyDelivery('delivery-installation-created', completePlan(), NOW)
    await store.reserveDelivery(delivery('delivery-installation-deleted'))

    await expect(store.applyDelivery('delivery-installation-deleted', {
      ...emptySyncPlan(),
      installations: [{
        githubInstallationId: '42',
        active: false,
        suspendedAt: null,
      }],
    }, NOW)).resolves.toBe('processed')

    expect(await client.db.select({
      active: githubInstallations.active,
    }).from(githubInstallations).where(eq(githubInstallations.githubInstallationId, '42')))
      .toEqual([{ active: false }])
  })

  it('keeps detach, deletion, and failure marking as safe no-ops', async () => {
    const store = createDrizzleWebhookStore(client.db)
    await expect(store.markDeliveryFailed('missing', new Error('missing'), NOW))
      .resolves.toBeUndefined()

    await store.reserveDelivery(delivery('delivery-noop'))
    await expect(store.applyDelivery('delivery-noop', {
      ...emptySyncPlan(),
      detachedRepositoryIds: ['R_missing'],
      deletedRepositoryIds: ['R_missing'],
    }, NOW)).resolves.toBe('processed')

    await store.markDeliveryFailed('delivery-noop', new Error('late concurrent failure'), NOW)
    expect(await deliveryStatus(client, 'delivery-noop')).toMatchObject({
      status: 'processed',
      errorMessage: null,
    })
  })
})

function delivery(deliveryId: string) {
  return {
    deliveryId,
    event: 'pull_request',
    action: 'opened',
    payload: { action: 'opened' },
  }
}

function completePlan(): WebhookSyncPlan {
  return {
    installations: [{
      githubInstallationId: '42',
      accountGithubId: '7',
      accountLogin: 'acme',
      accountType: 'Organization',
      active: true,
      suspendedAt: null,
    }],
    repositories: [{
      githubRepositoryId: 'R_repo',
      githubInstallationId: '42',
      owner: 'acme',
      name: 'rocket',
      fullName: 'acme/rocket',
      defaultBranch: 'main',
      private: true,
      archived: false,
    }],
    attachedRepositories: [],
    detachedRepositoryIds: [],
    deletedRepositoryIds: [],
    pullRequests: [{
      pullRequest: {
        githubPullRequestId: 'PR_one',
        githubRepositoryId: 'R_repo',
        number: 1,
        title: 'Current title',
        url: 'https://github.com/acme/rocket/pull/1',
        authorLogin: 'author',
        baseRefName: 'main',
        headRefName: 'feature',
        headRepositoryOwner: 'acme',
        headRepositoryName: 'rocket',
        isDraft: false,
        state: 'OPEN',
        mergeable: 'MERGEABLE',
        githubUpdatedAt: new Date('2026-06-06T11:00:00.000Z'),
        closedAt: null,
        mergedAt: null,
        commitsTotalCount: 2,
        commentsTotalCount: 3,
      },
      reviewRequests: [{ reviewerKind: 'User', reviewerHandle: 'reviewer' }],
    }],
    reviews: [{
      githubReviewId: 'PRR_one',
      githubPullRequestId: 'PR_one',
      authorLogin: 'reviewer',
      state: 'APPROVED',
      submittedAt: new Date('2026-06-06T11:30:00.000Z'),
    }],
  }
}

async function deliveryStatus(client: DatabaseClient, deliveryId: string) {
  const [row] = await client.db.select().from(webhookDeliveries)
    .where(eq(webhookDeliveries.deliveryId, deliveryId))
  return row
}

async function cleanTestRows(client: DatabaseClient) {
  await client.db.delete(webhookDeliveries).where(inArray(webhookDeliveries.deliveryId, [
    'delivery-success',
    'delivery-retry',
    'delivery-new',
    'delivery-stale',
    'delivery-noop',
    'delivery-current',
    'delivery-partial',
    'delivery-original-repository',
    'delivery-replacement-repository',
    'delivery-installation-created',
    'delivery-installation-deleted',
    'delivery-inactive-original',
    'delivery-inactive-replacement',
  ]))
  await client.db.delete(pullRequestReviews)
    .where(eq(pullRequestReviews.githubReviewId, 'PRR_one'))
  await client.db.delete(pullRequestReviewRequests)
    .where(eq(pullRequestReviewRequests.githubPullRequestId, 'PR_one'))
  await client.db.delete(pullRequests)
    .where(eq(pullRequests.githubPullRequestId, 'PR_one'))
  await client.db.delete(repositories)
    .where(inArray(repositories.githubRepositoryId, ['R_repo', 'R_replacement']))
  await client.db.delete(githubInstallations)
    .where(inArray(githubInstallations.githubInstallationId, ['42', '43']))
}

async function ensureTestDatabase(url: string) {
  const databaseUrl = new URL(url)
  const databaseName = decodeURIComponent(databaseUrl.pathname.slice(1))
  if (!databaseName) throw new Error('Webhook integration database URL must include a database')

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

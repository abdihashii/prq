import { eq, inArray } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { createHmac } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createDatabase,
  type DatabaseClient,
  TEST_DATABASE_URL,
} from '../../db'
import {
  autoRetargetEvents,
  githubInstallations,
  pullRequestReviewRequests,
  pullRequestReviews,
  pullRequests,
  repositories,
  webhookDeliveries,
} from '../../db/schema'
import { createAutoRetargetService } from '../auto-retarget'
import { createDrizzleAutoRetargetStore } from '../auto-retarget/store'
import type { GitHubRetargetClient, RemotePullRequest } from '../auto-retarget/types'
import { ingestGitHubWebhook } from '../webhook'
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

  it('retargets one direct child once across duplicate merged-PR deliveries', async () => {
    await seedAutoRetargetStack(client)
    const github = githubClient()
    const service = createAutoRetargetService({
      store: createDrizzleAutoRetargetStore(client.db),
      github,
      now: () => NOW,
    })

    const concurrent = await Promise.all([
      service.retargetMergedParent(retargetArgs()),
      service.retargetMergedParent(retargetArgs()),
    ])
    expect(concurrent.sort()).toEqual(['already-complete', 'succeeded'])
    await expect(service.retargetMergedParent(retargetArgs())).resolves.toBe('already-complete')

    expect(github.retarget).toHaveBeenCalledOnce()
    expect(await client.db.select().from(autoRetargetEvents)).toMatchObject([{
      githubPullRequestId: 'PR_child',
      parentGithubPullRequestId: 'PR_parent',
      previousBaseRefName: 'feature/parent',
      nextBaseRefName: 'main',
      status: 'succeeded',
      errorMessage: null,
    }])
    expect(await client.db.select({
      baseRefName: pullRequests.baseRefName,
    }).from(pullRequests).where(eq(pullRequests.githubPullRequestId, 'PR_child')))
      .toEqual([{ baseRefName: 'main' }])
  })

  it('records a failure and safely retries the same delivery', async () => {
    await seedAutoRetargetStack(client)
    const github = githubClient()
    vi.mocked(github.inspect)
      .mockRejectedValueOnce(new Error('GitHub unavailable'))
      .mockResolvedValue(remotePullRequest('feature/parent'))
    const service = createAutoRetargetService({
      store: createDrizzleAutoRetargetStore(client.db),
      github,
      now: () => NOW,
    })

    await expect(service.retargetMergedParent(retargetArgs())).rejects.toThrow('GitHub unavailable')
    await expect(service.retargetMergedParent(retargetArgs())).resolves.toBe('succeeded')

    expect(await client.db.select({
      status: autoRetargetEvents.status,
      errorMessage: autoRetargetEvents.errorMessage,
    }).from(autoRetargetEvents).orderBy(autoRetargetEvents.id)).toEqual([
      { status: 'failed', errorMessage: 'GitHub unavailable' },
      { status: 'succeeded', errorMessage: null },
    ])
  })

  it('recovers an applying attempt after GitHub changed but the local commit did not', async () => {
    await seedAutoRetargetStack(client)
    await client.db.insert(autoRetargetEvents).values({
      githubPullRequestId: 'PR_child',
      parentGithubPullRequestId: 'PR_parent',
      deliveryId: 'delivery-retarget',
      previousBaseRefName: 'feature/parent',
      nextBaseRefName: 'main',
      status: 'applying',
    })
    const github = githubClient()
    vi.mocked(github.inspect).mockResolvedValue(remotePullRequest('main'))
    const service = createAutoRetargetService({
      store: createDrizzleAutoRetargetStore(client.db),
      github,
      now: () => NOW,
    })

    await expect(service.retargetMergedParent(retargetArgs())).resolves.toBe('succeeded')

    expect(github.retarget).not.toHaveBeenCalled()
    expect(await client.db.select({
      status: autoRetargetEvents.status,
    }).from(autoRetargetEvents)).toEqual([{ status: 'succeeded' }])
  })

  it('recovers when the child-base webhook arrives before applying is finalized', async () => {
    await seedAutoRetargetStack(client)
    await client.db.insert(autoRetargetEvents).values({
      githubPullRequestId: 'PR_child',
      parentGithubPullRequestId: 'PR_parent',
      deliveryId: 'delivery-retarget',
      previousBaseRefName: 'feature/parent',
      nextBaseRefName: 'main',
      status: 'applying',
    })
    await client.db.update(pullRequests).set({ baseRefName: 'main' })
      .where(eq(pullRequests.githubPullRequestId, 'PR_child'))
    const github = githubClient()
    vi.mocked(github.inspect).mockResolvedValue(remotePullRequest('main'))
    const service = createAutoRetargetService({
      store: createDrizzleAutoRetargetStore(client.db),
      github,
    })

    await expect(service.retargetMergedParent(retargetArgs())).resolves.toBe('succeeded')
    expect(github.retarget).not.toHaveBeenCalled()
  })

  it('records an ambiguous PATCH failure and recovers without a second mutation', async () => {
    await seedAutoRetargetStack(client)
    const github = githubClient()
    vi.mocked(github.inspect)
      .mockResolvedValueOnce(remotePullRequest('feature/parent'))
      .mockResolvedValueOnce(remotePullRequest('feature/parent'))
      .mockRejectedValueOnce(new Error('recovery unavailable'))
      .mockRejectedValueOnce(new Error('retry inspection unavailable'))
      .mockResolvedValueOnce(remotePullRequest('main'))
    vi.mocked(github.retarget).mockRejectedValueOnce(new Error('connection reset after PATCH'))
    const service = createAutoRetargetService({
      store: createDrizzleAutoRetargetStore(client.db),
      github,
      now: () => NOW,
    })

    await expect(service.retargetMergedParent(retargetArgs()))
      .rejects.toThrow('connection reset after PATCH')
    expect(await client.db.select({
      status: autoRetargetEvents.status,
    }).from(autoRetargetEvents).orderBy(autoRetargetEvents.id)).toEqual([
      { status: 'applying' },
      { status: 'failed' },
    ])

    await expect(service.retargetMergedParent(retargetArgs()))
      .rejects.toThrow('retry inspection unavailable')
    expect(await client.db.select({
      status: autoRetargetEvents.status,
    }).from(autoRetargetEvents).orderBy(autoRetargetEvents.id)).toEqual([
      { status: 'applying' },
      { status: 'failed' },
      { status: 'failed' },
    ])

    await expect(service.retargetMergedParent(retargetArgs())).resolves.toBe('succeeded')
    expect(github.retarget).toHaveBeenCalledOnce()
    expect(await client.db.select({
      status: autoRetargetEvents.status,
    }).from(autoRetargetEvents).orderBy(autoRetargetEvents.id)).toEqual([
      { status: 'succeeded' },
      { status: 'failed' },
      { status: 'failed' },
    ])
  })

  it('records safely skipped local inference and state cases without calling GitHub', async () => {
    for (const scenario of [
      {
        reason: 'no_direct_child',
        arrange: async () => {
          await client.db.delete(pullRequests).where(eq(pullRequests.githubPullRequestId, 'PR_child'))
        },
      },
      {
        reason: 'child_is_not_open',
        arrange: async () => {
          await client.db.update(pullRequests).set({ state: 'CLOSED' })
            .where(eq(pullRequests.githubPullRequestId, 'PR_child'))
        },
      },
      {
        reason: 'multiple_direct_children',
        arrange: async () => {
          await client.db.insert(pullRequests).values(storedPullRequest(
            'PR_second_child',
            3,
            'feature/parent',
            'feature/second-child',
            'OPEN',
          ))
        },
      },
      {
        reason: 'repository_or_installation_unavailable',
        arrange: async () => {
          await client.db.update(githubInstallations).set({ active: false })
            .where(eq(githubInstallations.githubInstallationId, '42'))
        },
      },
      {
        reason: 'parent_head_repository_is_not_the_base_repository',
        arrange: async () => {
          await client.db.update(pullRequests).set({ headRepositoryOwner: 'fork-owner' })
            .where(eq(pullRequests.githubPullRequestId, 'PR_parent'))
        },
      },
    ]) {
      await cleanTestRows(client)
      await seedAutoRetargetStack(client)
      await scenario.arrange()
      const github = githubClient()
      const service = createAutoRetargetService({
        store: createDrizzleAutoRetargetStore(client.db),
        github,
      })

      await expect(service.retargetMergedParent(retargetArgs())).resolves.toBe('skipped')
      expect(github.inspect).not.toHaveBeenCalled()
      expect(github.retarget).not.toHaveBeenCalled()
      expect(await client.db.select({
        status: autoRetargetEvents.status,
        errorMessage: autoRetargetEvents.errorMessage,
      }).from(autoRetargetEvents)).toEqual([{
        status: 'skipped',
        errorMessage: scenario.reason,
      }])
    }
  })

  it('records an already-targeting remote child as skipped without patching GitHub', async () => {
    await seedAutoRetargetStack(client)
    const github = githubClient()
    vi.mocked(github.inspect).mockResolvedValue(remotePullRequest('main'))
    const service = createAutoRetargetService({
      store: createDrizzleAutoRetargetStore(client.db),
      github,
    })

    await expect(service.retargetMergedParent(retargetArgs())).resolves.toBe('skipped')

    expect(github.retarget).not.toHaveBeenCalled()
    expect(await client.db.select({
      status: autoRetargetEvents.status,
      errorMessage: autoRetargetEvents.errorMessage,
    }).from(autoRetargetEvents)).toEqual([{
      status: 'skipped',
      errorMessage: 'already_targeting_desired_base',
    }])
  })

  it('records remote closed and changed-relationship skips without patching GitHub', async () => {
    for (const remote of [
      { ...remotePullRequest('feature/parent'), state: 'CLOSED' as const },
      remotePullRequest('feature/manual-base'),
    ]) {
      await cleanTestRows(client)
      await seedAutoRetargetStack(client)
      const github = githubClient()
      vi.mocked(github.inspect).mockResolvedValue(remote)
      const service = createAutoRetargetService({
        store: createDrizzleAutoRetargetStore(client.db),
        github,
      })

      await expect(service.retargetMergedParent(retargetArgs())).resolves.toBe('skipped')
      expect(github.retarget).not.toHaveBeenCalled()
    }
  })

  it('runs a signed merged-PR webhook through persistence, retargeting, and duplicate recovery', async () => {
    await seedAutoRetargetStack(client)
    const github = githubClient()
    const store = createDrizzleWebhookStore(client.db)
    const autoRetarget = createAutoRetargetService({
      store: createDrizzleAutoRetargetStore(client.db),
      github,
      now: () => NOW,
    })
    const request = signedMergedPullRequestRequest()

    await ingestGitHubWebhook(request, {
      secret: 'webhook-secret',
      store,
      autoRetarget,
      now: () => NOW,
    })
    await ingestGitHubWebhook(signedMergedPullRequestRequest(), {
      secret: 'webhook-secret',
      store,
      autoRetarget,
      now: () => NOW,
    })

    expect(github.retarget).toHaveBeenCalledOnce()
    expect(await client.db.select({
      status: autoRetargetEvents.status,
      previousBaseRefName: autoRetargetEvents.previousBaseRefName,
    }).from(autoRetargetEvents)).toEqual([{
      status: 'succeeded',
      previousBaseRefName: 'feature/parent',
    }])
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
  await client.db.delete(autoRetargetEvents)
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
    'delivery-retarget',
    'delivery-signed-retarget',
  ]))
  await client.db.delete(pullRequestReviews)
    .where(eq(pullRequestReviews.githubReviewId, 'PRR_one'))
  await client.db.delete(pullRequestReviewRequests)
    .where(eq(pullRequestReviewRequests.githubPullRequestId, 'PR_one'))
  await client.db.delete(pullRequests)
    .where(inArray(pullRequests.githubPullRequestId, [
      'PR_one',
      'PR_parent',
      'PR_child',
      'PR_second_child',
    ]))
  await client.db.delete(repositories)
    .where(inArray(repositories.githubRepositoryId, ['R_repo', 'R_replacement']))
  await client.db.delete(githubInstallations)
    .where(inArray(githubInstallations.githubInstallationId, ['42', '43']))
}

async function seedAutoRetargetStack(client: DatabaseClient) {
  await client.db.insert(githubInstallations).values({
    githubInstallationId: '42',
    accountGithubId: '7',
    accountLogin: 'acme',
    accountType: 'Organization',
    active: true,
  })
  await client.db.insert(repositories).values({
    githubRepositoryId: 'R_repo',
    githubInstallationId: '42',
    owner: 'acme',
    name: 'rocket',
    fullName: 'acme/rocket',
  })
  await client.db.insert(pullRequests).values([
    storedPullRequest('PR_parent', 1, 'main', 'feature/parent', 'MERGED'),
    storedPullRequest('PR_child', 2, 'feature/parent', 'feature/child', 'OPEN'),
  ])
  await client.db.insert(webhookDeliveries).values({
    deliveryId: 'delivery-retarget',
    event: 'pull_request',
    action: 'closed',
    payload: { action: 'closed' },
    status: 'processed',
  })
}

function storedPullRequest(
  id: string,
  number: number,
  baseRefName: string,
  headRefName: string,
  state: 'OPEN' | 'CLOSED' | 'MERGED',
) {
  return {
    githubPullRequestId: id,
    githubRepositoryId: 'R_repo',
    number,
    title: id,
    url: `https://github.com/acme/rocket/pull/${number}`,
    authorLogin: 'author',
    baseRefName,
    headRefName,
    headRepositoryOwner: 'acme',
    headRepositoryName: 'rocket',
    isDraft: false,
    state,
    githubUpdatedAt: new Date('2026-06-06T11:00:00.000Z'),
    closedAt: state === 'OPEN' ? null : NOW,
    mergedAt: state === 'MERGED' ? NOW : null,
  }
}

function retargetArgs() {
  return {
    deliveryId: 'delivery-retarget',
    parentPullRequestId: 'PR_parent',
    desiredBaseRefName: 'main',
  }
}

function githubClient(): GitHubRetargetClient {
  return {
    inspect: vi.fn().mockResolvedValue(remotePullRequest('feature/parent')),
    retarget: vi.fn().mockResolvedValue(remotePullRequest('main')),
  }
}

function remotePullRequest(baseRefName: string): RemotePullRequest {
  return {
    state: 'OPEN',
    baseRefName,
    githubUpdatedAt: NOW,
  }
}

function signedMergedPullRequestRequest(): Request {
  const body = JSON.stringify({
    action: 'closed',
    installation: {
      id: 42,
      account: { id: 7, login: 'acme', type: 'Organization' },
      suspended_at: null,
    },
    repository: {
      node_id: 'R_repo',
      name: 'rocket',
      full_name: 'acme/rocket',
      owner: { id: 7, login: 'acme', type: 'Organization' },
      default_branch: 'main',
      private: true,
      archived: false,
    },
    pull_request: {
      node_id: 'PR_parent',
      number: 1,
      title: 'Parent',
      html_url: 'https://github.com/acme/rocket/pull/1',
      user: { login: 'author' },
      base: { ref: 'main' },
      head: { ref: 'feature/parent', repo: { name: 'rocket', owner: { login: 'acme' } } },
      draft: false,
      state: 'closed',
      merged: true,
      updated_at: '2026-06-06T12:00:00Z',
      closed_at: '2026-06-06T12:00:00Z',
      merged_at: '2026-06-06T12:00:00Z',
      requested_reviewers: [],
      requested_teams: [],
    },
  })
  const signature = createHmac('sha256', 'webhook-secret').update(body).digest('hex')
  return new Request('http://localhost/api/webhooks/github', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-github-delivery': 'delivery-signed-retarget',
      'x-github-event': 'pull_request',
      'x-hub-signature-256': `sha256=${signature}`,
    },
    body,
  })
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

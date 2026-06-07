import { and, eq, isNull, lte, ne, or } from 'drizzle-orm'
import { getDatabase, type Database } from '../../db'
import {
  githubInstallations,
  pullRequestReviewRequests,
  pullRequestReviews,
  pullRequests,
  repositories,
  webhookDeliveries,
} from '../../db/schema'
import type {
  InstallationSnapshot,
  PullRequestSnapshot,
  RepositorySnapshot,
  WebhookStore,
  WebhookSyncPlan,
} from './types'

const MAX_ERROR_MESSAGE_LENGTH = 1000
type WebhookDb = Pick<Database, 'delete' | 'insert' | 'select' | 'update'>

export function createDrizzleWebhookStore(db: Database = getDatabase().db): WebhookStore {
  return {
    async reserveDelivery(delivery) {
      // Reservation is separate so failed supported-payload validation and
      // rolled-back state writes remain retryable and observable.
      await db.insert(webhookDeliveries).values({
        deliveryId: delivery.deliveryId,
        event: delivery.event,
        action: delivery.action,
        payload: delivery.payload,
      }).onConflictDoNothing()
    },

    async applyDelivery(deliveryId, syncPlan, now) {
      return db.transaction(async (tx) => {
        const [delivery] = await tx.select({ status: webhookDeliveries.status })
          .from(webhookDeliveries)
          .where(eq(webhookDeliveries.deliveryId, deliveryId))
          .for('update')

        if (!delivery) throw new Error(`Webhook delivery ${deliveryId} was not reserved`)
        if (delivery.status === 'processed') return 'duplicate'

        for (const installation of syncPlan.installations) {
          await applyInstallation(tx, installation, now)
        }

        for (const repository of syncPlan.repositories) {
          await upsertRepository(tx, repository, now)
        }

        for (const access of syncPlan.attachedRepositories) {
          await tx.update(repositories)
            .set({
              githubInstallationId: access.githubInstallationId,
              updatedAt: now,
            })
            .where(eq(repositories.githubRepositoryId, access.githubRepositoryId))
        }

        for (const repositoryId of syncPlan.detachedRepositoryIds) {
          await tx.update(repositories)
            .set({ githubInstallationId: null, updatedAt: now })
            .where(eq(repositories.githubRepositoryId, repositoryId))
        }

        for (const repositoryId of syncPlan.deletedRepositoryIds) {
          await tx.delete(repositories).where(eq(repositories.githubRepositoryId, repositoryId))
        }

        for (const entry of syncPlan.pullRequests) {
          const accepted = await upsertPullRequest(tx, entry.pullRequest, now)
          if (accepted && entry.reviewRequests !== undefined) {
            await tx.delete(pullRequestReviewRequests).where(eq(
              pullRequestReviewRequests.githubPullRequestId,
              entry.pullRequest.githubPullRequestId,
            ))
            if (entry.reviewRequests.length > 0) {
              await tx.insert(pullRequestReviewRequests).values(
                entry.reviewRequests.map(reviewRequest => ({
                  githubPullRequestId: entry.pullRequest.githubPullRequestId,
                  ...reviewRequest,
                  updatedAt: now,
                })),
              ).onConflictDoNothing()
            }
          }
        }

        for (const review of syncPlan.reviews) {
          await tx.insert(pullRequestReviews).values({
            ...review,
            updatedAt: now,
          }).onConflictDoUpdate({
            target: pullRequestReviews.githubReviewId,
            set: {
              githubPullRequestId: review.githubPullRequestId,
              authorLogin: review.authorLogin,
              state: review.state,
              submittedAt: review.submittedAt,
              updatedAt: now,
            },
          })
        }

        const references = await existingDeliveryReferences(tx, syncPlan)
        await tx.update(webhookDeliveries).set({
          ...references,
          status: 'processed',
          processedAt: now,
          errorMessage: null,
        }).where(eq(webhookDeliveries.deliveryId, deliveryId))

        return 'processed'
      })
    },

    async markDeliveryFailed(deliveryId, error, now) {
      await db.update(webhookDeliveries).set({
        status: 'failed',
        processedAt: now,
        errorMessage: boundedErrorMessage(error),
      }).where(and(
        eq(webhookDeliveries.deliveryId, deliveryId),
        ne(webhookDeliveries.status, 'processed'),
      ))
    },
  }
}

async function upsertRepository(db: WebhookDb, repository: RepositorySnapshot, now: Date) {
  await reconcileDetachedRepositoryName(db, repository, now)
  await db.insert(repositories).values({
    githubRepositoryId: repository.githubRepositoryId,
    githubInstallationId: repository.githubInstallationId,
    owner: repository.owner,
    name: repository.name,
    fullName: repository.fullName,
    defaultBranch: repository.defaultBranch ?? null,
    private: repository.private ?? false,
    archived: repository.archived ?? false,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: repositories.githubRepositoryId,
    set: {
      owner: repository.owner,
      name: repository.name,
      fullName: repository.fullName,
      ...(repository.defaultBranch !== undefined
        ? { defaultBranch: repository.defaultBranch }
        : {}),
      ...(repository.private !== undefined ? { private: repository.private } : {}),
      ...(repository.archived !== undefined ? { archived: repository.archived } : {}),
      updatedAt: now,
    },
  })
}

async function applyInstallation(
  db: WebhookDb,
  installation: WebhookSyncPlan['installations'][number],
  now: Date,
) {
  if (!hasAnyInstallationAccountField(installation)) {
    await db.update(githubInstallations).set({
      ...(installation.active !== undefined ? { active: installation.active } : {}),
      ...(installation.suspendedAt !== undefined
        ? { suspendedAt: installation.suspendedAt }
        : {}),
      updatedAt: now,
    }).where(eq(githubInstallations.githubInstallationId, installation.githubInstallationId))
    return
  }
  if (!hasCompleteInstallationAccount(installation)) {
    throw new Error('Installation snapshot account details must be complete')
  }

  await db.insert(githubInstallations).values({
    githubInstallationId: installation.githubInstallationId,
    accountGithubId: installation.accountGithubId,
    accountLogin: installation.accountLogin,
    accountType: installation.accountType,
    active: installation.active ?? true,
    suspendedAt: installation.suspendedAt ?? null,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: githubInstallations.githubInstallationId,
    set: {
      accountGithubId: installation.accountGithubId,
      accountLogin: installation.accountLogin,
      accountType: installation.accountType,
      ...(installation.active !== undefined ? { active: installation.active } : {}),
      ...(installation.suspendedAt !== undefined
        ? { suspendedAt: installation.suspendedAt }
        : {}),
      updatedAt: now,
    },
  })
}

function hasAnyInstallationAccountField(installation: InstallationSnapshot): boolean {
  return installation.accountGithubId !== undefined
    || installation.accountLogin !== undefined
    || installation.accountType !== undefined
}

function hasCompleteInstallationAccount(
  installation: InstallationSnapshot,
): installation is InstallationSnapshot & Required<
  Pick<InstallationSnapshot, 'accountGithubId' | 'accountLogin' | 'accountType'>
> {
  return installation.accountGithubId !== undefined
    && installation.accountLogin !== undefined
    && installation.accountType !== undefined
}

async function reconcileDetachedRepositoryName(
  db: WebhookDb,
  repository: RepositorySnapshot,
  now: Date,
) {
  const [staleRepository] = await db.select({
    githubRepositoryId: repositories.githubRepositoryId,
  }).from(repositories).leftJoin(
    githubInstallations,
    eq(repositories.githubInstallationId, githubInstallations.githubInstallationId),
  ).where(and(
    eq(repositories.owner, repository.owner),
    eq(repositories.name, repository.name),
    ne(repositories.githubRepositoryId, repository.githubRepositoryId),
    or(
      isNull(repositories.githubInstallationId),
      eq(githubInstallations.active, false),
    ),
  )).limit(1).for('update', { of: repositories })

  if (!staleRepository) return

  const historicalName = `${repository.name}#historical-${staleRepository.githubRepositoryId}`
  await db.update(repositories).set({
    name: historicalName,
    fullName: `${repository.owner}/${historicalName}`,
    updatedAt: now,
  }).where(eq(repositories.githubRepositoryId, staleRepository.githubRepositoryId))
}

async function upsertPullRequest(
  db: WebhookDb,
  pullRequest: PullRequestSnapshot,
  now: Date,
): Promise<boolean> {
  const accepted = await db.insert(pullRequests).values({
    ...pullRequest,
    mergeable: pullRequest.mergeable ?? 'UNKNOWN',
    commitsTotalCount: pullRequest.commitsTotalCount ?? 0,
    commentsTotalCount: pullRequest.commentsTotalCount ?? 0,
    lastSyncedAt: now,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: pullRequests.githubPullRequestId,
    set: {
      githubRepositoryId: pullRequest.githubRepositoryId,
      number: pullRequest.number,
      title: pullRequest.title,
      url: pullRequest.url,
      authorLogin: pullRequest.authorLogin,
      baseRefName: pullRequest.baseRefName,
      headRefName: pullRequest.headRefName,
      headRepositoryOwner: pullRequest.headRepositoryOwner,
      headRepositoryName: pullRequest.headRepositoryName,
      isDraft: pullRequest.isDraft,
      state: pullRequest.state,
      ...(pullRequest.mergeable !== undefined ? { mergeable: pullRequest.mergeable } : {}),
      githubUpdatedAt: pullRequest.githubUpdatedAt,
      closedAt: pullRequest.closedAt,
      mergedAt: pullRequest.mergedAt,
      ...(pullRequest.commitsTotalCount !== undefined
        ? { commitsTotalCount: pullRequest.commitsTotalCount }
        : {}),
      ...(pullRequest.commentsTotalCount !== undefined
        ? { commentsTotalCount: pullRequest.commentsTotalCount }
        : {}),
      lastSyncedAt: now,
      updatedAt: now,
    },
    where: lte(pullRequests.githubUpdatedAt, pullRequest.githubUpdatedAt),
  }).returning({ githubPullRequestId: pullRequests.githubPullRequestId })

  return accepted.length > 0
}

async function existingDeliveryReferences(db: WebhookDb, syncPlan: WebhookSyncPlan): Promise<{
  githubInstallationId: string | null
  githubRepositoryId: string | null
}> {
  const installationId = syncPlan.installations[0]?.githubInstallationId ?? null
  const repositoryId = syncPlan.repositories[0]?.githubRepositoryId
    ?? syncPlan.detachedRepositoryIds[0]
    ?? null

  const [installation] = installationId
    ? await db.select({ id: githubInstallations.githubInstallationId })
        .from(githubInstallations)
        .where(eq(githubInstallations.githubInstallationId, installationId))
        .limit(1)
    : []
  const [repository] = repositoryId
    ? await db.select({ id: repositories.githubRepositoryId })
        .from(repositories)
        .where(eq(repositories.githubRepositoryId, repositoryId))
        .limit(1)
    : []

  return {
    githubInstallationId: installation?.id ?? null,
    githubRepositoryId: repository?.id ?? null,
  }
}

function boundedErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.slice(0, MAX_ERROR_MESSAGE_LENGTH)
}

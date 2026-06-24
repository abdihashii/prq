import {
  assignBucket,
  DashboardResponseSchema,
  inferDashboardStacks,
  mergeTrackableRepos,
  type Bucket,
  type DashboardResponse,
  type PullRequest,
  type RequestedReviewer,
} from '@prq/shared'
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { getDatabase, type Database } from '../db'
import {
  autoRetargetEvents,
  githubInstallations,
  githubUserRepositories,
  pullRequestReviewRequests,
  pullRequestReviews,
  pullRequests,
  repositories,
} from '../db/schema'
import { mapWithConcurrency } from './concurrency'
import { DashboardBadCredentialsError, DashboardUpstreamError } from './errors'
import {
  createGitHubDashboardAuthorization,
  createGitHubDashboardReconciler,
} from './github'
import type {
  DashboardAuthorization,
  DashboardFacade,
  DashboardProjectionService,
  DashboardReconciler,
  DashboardStore,
  StoredDashboardState,
  StoredPullRequest,
} from './types'

export type {
  AuthorizedRepository,
  DashboardAuthorization,
  DashboardFacade,
  DashboardProjectionService,
  DashboardReconciler,
  DashboardStore,
  StoredDashboardState,
  StoredPullRequest,
  StoredRepository,
} from './types'

interface DashboardDependencies {
  store?: DashboardStore
  now?: () => Date
}

export function createDashboardService(
  dependencies: DashboardDependencies = {},
): DashboardProjectionService {
  const store = dependencies.store ?? createDrizzleDashboardStore()
  const now = dependencies.now ?? (() => new Date())

  return {
    async getDashboard({ viewer, repositoryAllowlist }) {
      const state = await store.load(viewer)
      return projectDashboard(viewer.login, repositoryAllowlist, state, now())
    },
  }
}

interface DashboardFacadeDependencies extends DashboardDependencies {
  authorization?: DashboardAuthorization
  reconciler?: DashboardReconciler
  logError?: (message: string, error: unknown) => void
}

const RECONCILIATION_INTERVAL_MS = 60 * 60 * 1000
const RECONCILIATION_CONCURRENCY = 4

export function createDashboardFacade(
  dependencies: DashboardFacadeDependencies = {},
): DashboardFacade {
  const authorization = dependencies.authorization ?? createGitHubDashboardAuthorization()
  const reconciler = dependencies.reconciler ?? createGitHubDashboardReconciler()
  const projection = createDashboardService(dependencies)
  const now = dependencies.now ?? (() => new Date())
  const logError = dependencies.logError ?? ((message, error) => console.error(message, error))

  return {
    async getDashboard({ principal, repositoryAllowlist }) {
      const requestedAt = now()
      const authorizedRepositories = await authorization.refresh(principal, requestedAt)
      const repositoriesToReconcile = authorizedRepositories.filter(repository =>
        repository.dashboardReconciledAt === null
        || requestedAt.getTime() - repository.dashboardReconciledAt.getTime()
          >= RECONCILIATION_INTERVAL_MS,
      )

      await mapWithConcurrency(repositoriesToReconcile, RECONCILIATION_CONCURRENCY, async (repository) => {
        try {
          await reconciler.reconcile(repository, principal, requestedAt)
        }
        catch (error) {
          if (error instanceof DashboardBadCredentialsError) throw error
          if (repository.dashboardReconciledAt === null) throw new DashboardUpstreamError()
          logError(
            `dashboard reconciliation failed for ${repository.owner}/${repository.name}`,
            error,
          )
        }
      })

      return projection.getDashboard({
        viewer: { githubId: principal.githubId, login: principal.login },
        repositoryAllowlist,
      })
    },
  }
}

export function createDrizzleDashboardStore(db: Database = getDatabase().db): DashboardStore {
  return {
    async load(viewer) {
      const normalizedViewerLogin = viewer.login.toLowerCase()
      const activeViewerRepository = and(
        eq(githubInstallations.active, true),
        eq(githubUserRepositories.githubUserId, viewer.githubId),
      )

      // Independent reads over the same join graph; run them concurrently
      // rather than paying two serial round-trips on the dashboard hot path.
      const [ownedRepositories, installations] = await Promise.all([
        db.select({
          owner: repositories.owner,
          name: repositories.name,
        }).from(repositories)
          .innerJoin(
            githubUserRepositories,
            eq(repositories.githubRepositoryId, githubUserRepositories.githubRepositoryId),
          )
          .innerJoin(
            githubInstallations,
            eq(repositories.githubInstallationId, githubInstallations.githubInstallationId),
          )
          .where(activeViewerRepository)
          .orderBy(asc(repositories.owner), asc(repositories.name)),
        db.selectDistinct({
          installationId: githubInstallations.githubInstallationId,
          accountLogin: githubInstallations.accountLogin,
          accountType: githubInstallations.accountType,
        }).from(githubInstallations)
          .innerJoin(
            repositories,
            eq(repositories.githubInstallationId, githubInstallations.githubInstallationId),
          )
          .innerJoin(
            githubUserRepositories,
            eq(githubUserRepositories.githubRepositoryId, repositories.githubRepositoryId),
          )
          .where(activeViewerRepository)
          .orderBy(asc(githubInstallations.accountLogin)),
      ])

      const relevantToViewer = sql`(
        lower(${pullRequests.authorLogin}) = ${normalizedViewerLogin}
        or exists (
          select 1 from ${pullRequestReviewRequests}
          where ${pullRequestReviewRequests.githubPullRequestId} = ${pullRequests.githubPullRequestId}
            and ${pullRequestReviewRequests.reviewerKind} = 'User'
            and lower(${pullRequestReviewRequests.reviewerHandle}) = ${normalizedViewerLogin}
        )
        or exists (
          select 1 from ${pullRequestReviews}
          where ${pullRequestReviews.githubPullRequestId} = ${pullRequests.githubPullRequestId}
            and lower(${pullRequestReviews.authorLogin}) = ${normalizedViewerLogin}
        )
      )`

      const rows = await db.select({
        id: pullRequests.githubPullRequestId,
        number: pullRequests.number,
        title: pullRequests.title,
        url: pullRequests.url,
        repositoryOwner: repositories.owner,
        repositoryName: repositories.name,
        headRepositoryOwner: pullRequests.headRepositoryOwner,
        headRepositoryName: pullRequests.headRepositoryName,
        authorLogin: pullRequests.authorLogin,
        baseRefName: pullRequests.baseRefName,
        headRefName: pullRequests.headRefName,
        isDraft: pullRequests.isDraft,
        updatedAt: pullRequests.githubUpdatedAt,
        reviewDecision: pullRequests.reviewDecision,
        mergeable: pullRequests.mergeable,
        statusCheckRollupState: pullRequests.statusCheckRollupState,
        latestCommitCommittedAt: pullRequests.latestCommitCommittedAt,
        commitsTotalCount: pullRequests.commitsTotalCount,
        commentsTotalCount: pullRequests.commentsTotalCount,
        unresolvedThreadCount: pullRequests.unresolvedThreadCount,
      }).from(pullRequests)
        .innerJoin(repositories, eq(pullRequests.githubRepositoryId, repositories.githubRepositoryId))
        .innerJoin(
          githubUserRepositories,
          eq(repositories.githubRepositoryId, githubUserRepositories.githubRepositoryId),
        )
        .innerJoin(
          githubInstallations,
          eq(repositories.githubInstallationId, githubInstallations.githubInstallationId),
        )
        .where(and(
          eq(pullRequests.state, 'OPEN'),
          activeViewerRepository,
          relevantToViewer,
        ))
        .orderBy(desc(pullRequests.githubUpdatedAt), asc(pullRequests.githubPullRequestId))

      if (rows.length === 0) return { ownedRepositories, installations, pullRequests: [] }

      const ids = rows.map(row => row.id)
      const [reviewRequests, viewerReviews, autoRetargetHistory] = await Promise.all([
        db.select({
          pullRequestId: pullRequestReviewRequests.githubPullRequestId,
          kind: pullRequestReviewRequests.reviewerKind,
          handle: pullRequestReviewRequests.reviewerHandle,
        }).from(pullRequestReviewRequests)
          .where(inArray(pullRequestReviewRequests.githubPullRequestId, ids))
          .orderBy(
            asc(pullRequestReviewRequests.githubPullRequestId),
            asc(pullRequestReviewRequests.reviewerKind),
            asc(pullRequestReviewRequests.reviewerHandle),
          ),
        db.select({
          pullRequestId: pullRequestReviews.githubPullRequestId,
          submittedAt: pullRequestReviews.submittedAt,
        }).from(pullRequestReviews)
          .where(and(
            inArray(pullRequestReviews.githubPullRequestId, ids),
            sql`lower(${pullRequestReviews.authorLogin}) = ${normalizedViewerLogin}`,
          ))
          .orderBy(asc(pullRequestReviews.githubReviewId)),
        db.select({
          pullRequestId: autoRetargetEvents.githubPullRequestId,
          previousBaseRefName: autoRetargetEvents.previousBaseRefName,
        }).from(autoRetargetEvents)
          .where(and(
            inArray(autoRetargetEvents.githubPullRequestId, ids),
            eq(autoRetargetEvents.status, 'succeeded'),
          ))
          .orderBy(desc(autoRetargetEvents.id)),
      ])

      const requestsByPullRequest = new Map<string, RequestedReviewer[]>()
      for (const request of reviewRequests) {
        const requests = requestsByPullRequest.get(request.pullRequestId) ?? []
        requests.push({ kind: request.kind, handle: request.handle })
        requestsByPullRequest.set(request.pullRequestId, requests)
      }

      const reviewsByPullRequest = new Map<string, Array<Date | null>>()
      for (const review of viewerReviews) {
        const reviews = reviewsByPullRequest.get(review.pullRequestId) ?? []
        reviews.push(review.submittedAt)
        reviewsByPullRequest.set(review.pullRequestId, reviews)
      }

      const autoRetargetByPullRequest = new Map<string, string>()
      for (const event of autoRetargetHistory) {
        if (event.pullRequestId !== null
          && event.previousBaseRefName !== null
          && !autoRetargetByPullRequest.has(event.pullRequestId)) {
          autoRetargetByPullRequest.set(event.pullRequestId, event.previousBaseRefName)
        }
      }

      return {
        ownedRepositories,
        installations,
        pullRequests: rows.map(row => ({
          id: row.id,
          number: row.number,
          title: row.title,
          url: row.url,
          repository: { owner: row.repositoryOwner, name: row.repositoryName },
          headRepository: row.headRepositoryOwner !== null && row.headRepositoryName !== null
            ? { owner: row.headRepositoryOwner, name: row.headRepositoryName }
            : null,
          authorLogin: row.authorLogin,
          baseRefName: row.baseRefName,
          headRefName: row.headRefName,
          isDraft: row.isDraft,
          updatedAt: row.updatedAt,
          reviewDecision: row.reviewDecision,
          mergeable: row.mergeable,
          statusCheckRollupState: row.statusCheckRollupState,
          latestCommitCommittedAt: row.latestCommitCommittedAt,
          commitsTotalCount: row.commitsTotalCount,
          commentsTotalCount: row.commentsTotalCount,
          unresolvedThreadCount: row.unresolvedThreadCount,
          requestedReviewers: requestsByPullRequest.get(row.id) ?? [],
          viewerReviewSubmittedAt: reviewsByPullRequest.get(row.id) ?? [],
          autoRetargetPreviousBaseRefName: autoRetargetByPullRequest.get(row.id) ?? null,
        })),
      }
    },
  }
}

function projectDashboard(
  viewerLogin: string,
  // `null` means no filter: track every repo in install scope (All mode).
  repositoryAllowlist: ReadonlySet<string> | null,
  state: StoredDashboardState,
  now: Date,
): DashboardResponse {
  const pullRequests = state.pullRequests.flatMap((stored) => {
    const projected = projectPullRequest(stored, viewerLogin)
    return projected === null ? [] : [projected]
  })
  const trackableRepos = mergeTrackableRepos(state.ownedRepositories, pullRequests)
  const buckets: Record<Bucket, PullRequest[]> = {
    review: [],
    attention: [],
    ready: [],
    waiting: [],
    drafts: [],
  }

  for (const pullRequest of pullRequests) {
    const slug = `${pullRequest.repository.owner}/${pullRequest.repository.name}`
    if (repositoryAllowlist === null || repositoryAllowlist.has(slug)) {
      buckets[pullRequest.bucket].push(pullRequest)
    }
  }

  const syncedAt = now.toISOString()
  return DashboardResponseSchema.parse({
    viewerLogin,
    buckets: inferDashboardStacks(buckets),
    syncedAt,
    rateLimit: { cost: 0, remaining: 0, resetAt: syncedAt },
    trackableRepos,
    installations: state.installations,
  })
}

function projectPullRequest(stored: StoredPullRequest, viewerLogin: string): PullRequest | null {
  const viewerReviews = stored.viewerReviewSubmittedAt
  const submittedReviews = viewerReviews.filter((value): value is Date => value !== null)
  const viewerLatestReviewSubmittedAt = submittedReviews.length === 0
    ? null
    : new Date(Math.max(...submittedReviews.map(value => value.getTime())))
  const viewerIsRequestedReviewer = stored.requestedReviewers.some(request =>
    request.kind === 'User' && sameLogin(request.handle, viewerLogin),
  )
  const needsRereview = viewerLatestReviewSubmittedAt !== null
    && stored.latestCommitCommittedAt !== null
    && stored.latestCommitCommittedAt > viewerLatestReviewSubmittedAt

  const projected = {
    id: stored.id,
    number: stored.number,
    title: stored.title,
    url: stored.url,
    repository: stored.repository,
    headRepository: stored.headRepository,
    author: stored.authorLogin === null ? null : { login: stored.authorLogin },
    baseRefName: stored.baseRefName,
    headRefName: stored.headRefName,
    isDraft: stored.isDraft,
    updatedAt: stored.updatedAt.toISOString(),
    reviewDecision: stored.reviewDecision,
    mergeable: stored.mergeable,
    statusCheckRollup: stored.statusCheckRollupState === null
      ? null
      : { state: stored.statusCheckRollupState },
    latestCommit: stored.latestCommitCommittedAt === null
      ? null
      : { committedDate: stored.latestCommitCommittedAt.toISOString() },
    commitsTotalCount: stored.commitsTotalCount,
    commentsTotalCount: stored.commentsTotalCount,
    requestedReviewers: stored.requestedReviewers,
    viewerHasReviewed: viewerReviews.length > 0,
    viewerLatestReviewSubmittedAt: viewerLatestReviewSubmittedAt?.toISOString() ?? null,
    viewerIsRequestedReviewer,
    needsRereview,
    // Current webhook state cannot authoritatively provide these fields. Keep
    // that uncertainty inside this projection boundary with stable defaults.
    newCommentsSincePush: 0,
    unresolvedThreadCount: stored.unresolvedThreadCount,
    unresolvedThreadAuthors: [],
    ...(stored.autoRetargetPreviousBaseRefName === null
      ? {}
      : { autoRetarget: { previousBaseRefName: stored.autoRetargetPreviousBaseRefName } }),
  }

  const bucket = assignBucket(projected, viewerLogin)
  return bucket === null ? null : { ...projected, bucket }
}

function sameLogin(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase()
}

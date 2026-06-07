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
  githubInstallations,
  pullRequestReviewRequests,
  pullRequestReviews,
  pullRequests,
  repositories,
} from '../db/schema'
import type { AuthenticatedViewer } from '../auth/session'

export interface StoredRepository {
  owner: string
  name: string
}

export interface StoredPullRequest {
  id: string
  number: number
  title: string
  url: string
  repository: StoredRepository
  headRepository: StoredRepository | null
  authorLogin: string | null
  baseRefName: string
  headRefName: string
  isDraft: boolean
  updatedAt: Date
  reviewDecision: PullRequest['reviewDecision']
  mergeable: PullRequest['mergeable']
  statusCheckRollupState: NonNullable<PullRequest['statusCheckRollup']>['state'] | null
  latestCommitCommittedAt: Date | null
  commitsTotalCount: number
  commentsTotalCount: number
  unresolvedThreadCount: number
  requestedReviewers: RequestedReviewer[]
  viewerReviewSubmittedAt: Array<Date | null>
}

export interface StoredDashboardState {
  ownedRepositories: StoredRepository[]
  pullRequests: StoredPullRequest[]
}

export interface DashboardStore {
  load(viewer: AuthenticatedViewer): Promise<StoredDashboardState>
}

export interface DashboardService {
  getDashboard(args: {
    viewer: AuthenticatedViewer
    repositoryAllowlist: ReadonlySet<string>
  }): Promise<DashboardResponse>
}

interface DashboardDependencies {
  store?: DashboardStore
  now?: () => Date
}

export function createDashboardService(
  dependencies: DashboardDependencies = {},
): DashboardService {
  const store = dependencies.store ?? createDrizzleDashboardStore()
  const now = dependencies.now ?? (() => new Date())

  return {
    async getDashboard({ viewer, repositoryAllowlist }) {
      const state = await store.load(viewer)
      return projectDashboard(viewer.login, repositoryAllowlist, state, now())
    },
  }
}

export function createDrizzleDashboardStore(db: Database = getDatabase().db): DashboardStore {
  return {
    async load(viewer) {
      const normalizedViewerLogin = viewer.login.toLowerCase()
      const activeViewerInstallation = and(
        eq(githubInstallations.active, true),
        eq(githubInstallations.accountGithubId, viewer.githubId),
        eq(githubInstallations.accountType, 'User'),
      )

      const ownedRepositories = await db.select({
        owner: repositories.owner,
        name: repositories.name,
      }).from(repositories)
        .innerJoin(
          githubInstallations,
          eq(repositories.githubInstallationId, githubInstallations.githubInstallationId),
        )
        .where(activeViewerInstallation)
        .orderBy(asc(repositories.owner), asc(repositories.name))

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
          githubInstallations,
          eq(repositories.githubInstallationId, githubInstallations.githubInstallationId),
        )
        .where(and(
          eq(pullRequests.state, 'OPEN'),
          eq(githubInstallations.active, true),
          relevantToViewer,
        ))
        .orderBy(desc(pullRequests.githubUpdatedAt), asc(pullRequests.githubPullRequestId))

      if (rows.length === 0) return { ownedRepositories, pullRequests: [] }

      const ids = rows.map(row => row.id)
      const [reviewRequests, viewerReviews] = await Promise.all([
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

      return {
        ownedRepositories,
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
        })),
      }
    },
  }
}

function projectDashboard(
  viewerLogin: string,
  repositoryAllowlist: ReadonlySet<string>,
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
    if (repositoryAllowlist.has(slug)) buckets[pullRequest.bucket].push(pullRequest)
  }

  const syncedAt = now.toISOString()
  return DashboardResponseSchema.parse({
    viewerLogin,
    buckets: inferDashboardStacks(buckets),
    syncedAt,
    rateLimit: { cost: 0, remaining: 0, resetAt: syncedAt },
    trackableRepos,
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
  }

  const bucket = assignBucket(projected, viewerLogin)
  return bucket === null ? null : { ...projected, bucket }
}

function sameLogin(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase()
}

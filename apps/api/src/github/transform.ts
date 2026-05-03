import { assignBucket, type PullRequest } from '@prq/shared'
import type { RawPullRequest, RawResponse } from './schema.js'

export interface TransformResult {
  viewerLogin: string
  rateLimit: NonNullable<RawResponse['rateLimit']>
  pullRequests: PullRequest[]
}

export function transform(raw: RawResponse): TransformResult {
  if (raw.rateLimit === null) {
    throw new Error('GitHub response missing rateLimit')
  }
  const viewerLogin = raw.viewer.login

  const all = [
    ...(raw.authored.nodes ?? []),
    ...(raw.reviewRequested.nodes ?? []),
    ...(raw.reviewedBy.nodes ?? []),
  ]
    .filter((n): n is NonNullable<typeof n> => n !== null)
    .filter((n): n is RawPullRequest => n.__typename === 'PullRequest')

  const seen = new Set<string>()
  const unique = all.filter((pr) => {
    if (seen.has(pr.id)) return false
    seen.add(pr.id)
    return true
  })

  const pullRequests = unique
    .map((pr) => projectAndBucket(pr, viewerLogin))
    .filter((pr): pr is PullRequest => pr !== null)

  return { viewerLogin, rateLimit: raw.rateLimit, pullRequests }
}

function projectAndBucket(raw: RawPullRequest, viewerLogin: string): PullRequest | null {
  const firstCommitNode = raw.commits.nodes?.[0] ?? null
  const latestCommit = firstCommitNode
    ? { committedDate: firstCommitNode.commit.committedDate }
    : null

  const reviews = (raw.reviews?.nodes ?? []).filter(
    (r): r is NonNullable<typeof r> => r !== null,
  )
  const viewerReviews = reviews.filter((r) => r.author?.login === viewerLogin)
  const viewerHasReviewed = viewerReviews.length > 0

  const submittedTimestamps = viewerReviews
    .map((r) => r.submittedAt)
    .filter((t): t is string => t !== null)
  const viewerLatestReviewSubmittedAt
    = submittedTimestamps.length > 0
      ? submittedTimestamps.reduce((a, b) => (a > b ? a : b))
      : null

  const needsRereview
    = viewerHasReviewed
      && viewerLatestReviewSubmittedAt !== null
      && latestCommit !== null
      && latestCommit.committedDate > viewerLatestReviewSubmittedAt

  const reviewRequestNodes = (raw.reviewRequests?.nodes ?? []).filter(
    (n): n is NonNullable<typeof n> => n !== null,
  )
  const viewerIsRequestedReviewer = reviewRequestNodes.some((n) => {
    const rr = n.requestedReviewer
    return rr?.__typename === 'User' && rr.login === viewerLogin
  })

  const issueComments = (raw.comments.nodes ?? []).filter(
    (c): c is NonNullable<typeof c> => c !== null,
  )
  const threadComments = (raw.reviewThreads.nodes ?? [])
    .filter((t): t is NonNullable<typeof t> => t !== null)
    .flatMap((t) =>
      (t.comments.nodes ?? []).filter((c): c is NonNullable<typeof c> => c !== null),
    )

  const isNewNonSelf = (c: { createdAt: string, author: { login: string } | null }) =>
    c.author !== null
    && c.author.login !== viewerLogin
    && latestCommit !== null
    && c.createdAt > latestCommit.committedDate

  const newCommentsSincePush
    = issueComments.filter(isNewNonSelf).length + threadComments.filter(isNewNonSelf).length

  const reviewThreads = (raw.reviewThreads.nodes ?? []).filter(
    (t): t is NonNullable<typeof t> => t !== null,
  )
  const unresolvedThreadCount = reviewThreads.filter((t) => !t.isResolved).length

  const projected = {
    id: raw.id,
    number: raw.number,
    title: raw.title,
    url: raw.url,
    repository: { owner: raw.repository.owner.login, name: raw.repository.name },
    author: raw.author ? { login: raw.author.login } : null,
    baseRefName: raw.baseRefName,
    isDraft: raw.isDraft,
    updatedAt: raw.updatedAt,
    reviewDecision: raw.reviewDecision,
    mergeable: raw.mergeable,
    statusCheckRollup: raw.statusCheckRollup,
    latestCommit,
    commentsTotalCount: raw.comments.totalCount,
    viewerHasReviewed,
    viewerLatestReviewSubmittedAt,
    viewerIsRequestedReviewer,
    needsRereview,
    newCommentsSincePush,
    unresolvedThreadCount,
  }

  const bucket = assignBucket(projected, viewerLogin)
  if (bucket === null) return null

  return { ...projected, bucket }
}

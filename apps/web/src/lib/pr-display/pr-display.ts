import type { Bucket, PullRequest, RequestedReviewer } from '@prq/shared'
import { formatNumber } from '#/lib/format-number.js'

export type CiStatusKind = 'success' | 'pending' | 'failure'

export function getCiStatusKind(pr: PullRequest): CiStatusKind | null {
  if (pr.statusCheckRollup === null) return null
  switch (pr.statusCheckRollup.state) {
    case 'SUCCESS':
      return 'success'
    case 'PENDING':
    case 'EXPECTED':
      return 'pending'
    case 'FAILURE':
    case 'ERROR':
      return 'failure'
  }
}

export type ReviewBadgeLabel = 'Draft' | 'Approved' | 'Changes requested' | 'Review pending'

export function getReviewBadgeLabel(pr: PullRequest): ReviewBadgeLabel {
  if (pr.isDraft) return 'Draft'
  switch (pr.reviewDecision) {
    case 'APPROVED':
      return 'Approved'
    case 'CHANGES_REQUESTED':
      return 'Changes requested'
    case 'REVIEW_REQUIRED':
    case null:
      return 'Review pending'
  }
}

export function getContextualHint(pr: PullRequest): string | null {
  if (pr.mergeable === 'CONFLICTING') return 'merge conflict'
  if (pr.needsRereview) return 're-review (new commits since you reviewed)'
  if (pr.newCommentsSincePush > 0) {
    const n = pr.newCommentsSincePush
    return `${n} new comment${n === 1 ? '' : 's'} since your last push`
  }
  return null
}

export function formatHandleList(handles: string[], max = 2): string {
  if (handles.length === 0) return ''
  if (handles.length <= max) return handles.map((h) => `@${h}`).join(', ')
  const shown = handles.slice(0, max).map((h) => `@${h}`).join(', ')
  return `${shown} +${handles.length - max} more`
}

export function formatRequestedReviewers(reviewers: RequestedReviewer[], max = 2): string {
  return formatHandleList(reviewers.map((r) => r.handle), max)
}

export function getBucketMetaSuffix(pr: PullRequest, bucket: Bucket): string | null {
  if (bucket === 'waiting') {
    if (pr.requestedReviewers.length === 0) return null
    return `requested: ${formatRequestedReviewers(pr.requestedReviewers)}`
  }
  if (bucket === 'drafts') {
    const n = pr.commitsTotalCount
    return `${formatNumber(n)} commit${n === 1 ? '' : 's'}`
  }
  if (bucket === 'attention') {
    const n = pr.unresolvedThreadCount
    if (n === 0) return null
    const base = `${formatNumber(n)} unresolved comment${n === 1 ? '' : 's'}`
    if (pr.unresolvedThreadAuthors.length === 0) return base
    return `${base} from ${formatHandleList(pr.unresolvedThreadAuthors)}`
  }
  return null
}

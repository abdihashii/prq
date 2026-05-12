import type { Bucket } from '../types/bucket'
import type { PullRequest } from '../types/pullRequest'

type BucketInput = Pick<
  PullRequest,
  | 'isDraft'
  | 'author'
  | 'reviewDecision'
  | 'mergeable'
  | 'statusCheckRollup'
  | 'viewerHasReviewed'
  | 'viewerIsRequestedReviewer'
  | 'needsRereview'
  | 'newCommentsSincePush'
>

export function assignBucket(pr: BucketInput, viewerLogin: string): Bucket | null {
  const isMine = pr.author?.login === viewerLogin

  if (isMine && pr.isDraft) return 'drafts'

  if (!isMine) {
    if (pr.viewerIsRequestedReviewer) return 'review'
    if (pr.needsRereview) return 'review'
    return null
  }

  if (pr.reviewDecision === 'CHANGES_REQUESTED') return 'attention'
  if (pr.newCommentsSincePush > 0) return 'attention'

  if (
    pr.reviewDecision === 'APPROVED'
    && pr.statusCheckRollup?.state === 'SUCCESS'
    && pr.mergeable === 'MERGEABLE'
  ) {
    return 'ready'
  }

  return 'waiting'
}

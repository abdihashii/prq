import { describe, expect, it } from 'vitest'
import type { PullRequest } from '../../types/pullRequest'
import { assignBucket } from '../bucket'

const VIEWER = 'haji'

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

// Default: my non-draft PR with REVIEW_REQUIRED + mergeable=UNKNOWN, no checks/comments.
// Falls through to 'waiting'.
const make = (over: Partial<BucketInput> = {}): BucketInput => ({
  isDraft: false,
  author: { login: VIEWER },
  reviewDecision: 'REVIEW_REQUIRED',
  mergeable: 'UNKNOWN',
  statusCheckRollup: null,
  viewerHasReviewed: false,
  viewerIsRequestedReviewer: false,
  needsRereview: false,
  newCommentsSincePush: 0,
  ...over,
})

describe('assignBucket', () => {
  it('matches GitHub logins case-insensitively', () => {
    expect(assignBucket(make({ author: { login: 'HAJI' } }), VIEWER)).toBe('waiting')
  })

  describe('drafts', () => {
    it('routes my draft PRs to drafts', () => {
      expect(assignBucket(make({ isDraft: true }), VIEWER)).toBe('drafts')
    })

    it('drafts wins over ready (even if APPROVED + SUCCESS + MERGEABLE)', () => {
      const pr = make({
        isDraft: true,
        reviewDecision: 'APPROVED',
        statusCheckRollup: { state: 'SUCCESS' },
        mergeable: 'MERGEABLE',
      })
      expect(assignBucket(pr, VIEWER)).toBe('drafts')
    })

    it('drafts wins over attention (even with new comments since push)', () => {
      const pr = make({ isDraft: true, newCommentsSincePush: 5 })
      expect(assignBucket(pr, VIEWER)).toBe('drafts')
    })

    it("does not route others' draft PRs to drafts", () => {
      const pr = make({ author: { login: 'someone-else' }, isDraft: true })
      expect(assignBucket(pr, VIEWER)).toBeNull()
    })
  })

  describe('needs my review', () => {
    it("routes others' PRs where viewer is requested reviewer", () => {
      const pr = make({
        author: { login: 'someone-else' },
        viewerIsRequestedReviewer: true,
      })
      expect(assignBucket(pr, VIEWER)).toBe('review')
    })

    it("routes others' PRs needing re-review (viewer reviewed, new commits since)", () => {
      const pr = make({
        author: { login: 'someone-else' },
        viewerHasReviewed: true,
        needsRereview: true,
      })
      expect(assignBucket(pr, VIEWER)).toBe('review')
    })

    it("returns null for others' PRs the viewer reviewed and no re-review needed", () => {
      const pr = make({
        author: { login: 'someone-else' },
        viewerHasReviewed: true,
        needsRereview: false,
        viewerIsRequestedReviewer: false,
      })
      expect(assignBucket(pr, VIEWER)).toBeNull()
    })

    it('treats ghost author (null) as others — routes to review when requested', () => {
      const pr = make({ author: null, viewerIsRequestedReviewer: true })
      expect(assignBucket(pr, VIEWER)).toBe('review')
    })

    it('treats ghost author (null) as others — returns null when no review condition matches', () => {
      const pr = make({ author: null })
      expect(assignBucket(pr, VIEWER)).toBeNull()
    })
  })

  describe('needs my attention', () => {
    it('routes my PRs with CHANGES_REQUESTED', () => {
      expect(assignBucket(make({ reviewDecision: 'CHANGES_REQUESTED' }), VIEWER)).toBe('attention')
    })

    it('routes my PRs with new comments since push', () => {
      expect(assignBucket(make({ newCommentsSincePush: 2 }), VIEWER)).toBe('attention')
    })

    it('attention wins over ready when new comments exist alongside approval', () => {
      const pr = make({
        reviewDecision: 'APPROVED',
        statusCheckRollup: { state: 'SUCCESS' },
        mergeable: 'MERGEABLE',
        newCommentsSincePush: 1,
      })
      expect(assignBucket(pr, VIEWER)).toBe('attention')
    })
  })

  describe('ready to merge', () => {
    it('routes my APPROVED + SUCCESS + MERGEABLE PRs', () => {
      const pr = make({
        reviewDecision: 'APPROVED',
        statusCheckRollup: { state: 'SUCCESS' },
        mergeable: 'MERGEABLE',
      })
      expect(assignBucket(pr, VIEWER)).toBe('ready')
    })

    it.each(['PENDING', 'FAILURE', 'ERROR', 'EXPECTED'] as const)(
      'is not ready when statusCheckRollup state is %s',
      (state) => {
        const pr = make({
          reviewDecision: 'APPROVED',
          statusCheckRollup: { state },
          mergeable: 'MERGEABLE',
        })
        expect(assignBucket(pr, VIEWER)).toBe('waiting')
      },
    )

    it('is not ready when statusCheckRollup is null', () => {
      const pr = make({
        reviewDecision: 'APPROVED',
        statusCheckRollup: null,
        mergeable: 'MERGEABLE',
      })
      expect(assignBucket(pr, VIEWER)).toBe('waiting')
    })

    it.each(['UNKNOWN', 'CONFLICTING'] as const)('is not ready when mergeable=%s', (mergeable) => {
      const pr = make({
        reviewDecision: 'APPROVED',
        statusCheckRollup: { state: 'SUCCESS' },
        mergeable,
      })
      expect(assignBucket(pr, VIEWER)).toBe('waiting')
    })
  })

  describe('waiting on others', () => {
    it('routes my open non-draft PRs that match no other rule', () => {
      const pr = make({
        reviewDecision: 'REVIEW_REQUIRED',
        statusCheckRollup: { state: 'PENDING' },
        mergeable: 'MERGEABLE',
      })
      expect(assignBucket(pr, VIEWER)).toBe('waiting')
    })

    it('routes my PRs with reviewDecision=null to waiting', () => {
      expect(assignBucket(make({ reviewDecision: null }), VIEWER)).toBe('waiting')
    })
  })
})

import type { PullRequest } from '@prq/shared'
import { describe, expect, it } from 'vitest'
import {
  formatHandleList,
  formatRequestedReviewers,
  getBucketMetaSuffix,
  getCiStatusKind,
  getContextualHint,
  getReviewBadgeLabel,
} from '../pr-display'

type DisplayInput = Pick<
  PullRequest,
  'isDraft' | 'reviewDecision' | 'mergeable' | 'statusCheckRollup' | 'needsRereview' | 'newCommentsSincePush'
>

const make = (over: Partial<DisplayInput> = {}): DisplayInput => ({
  isDraft: false,
  reviewDecision: null,
  mergeable: 'UNKNOWN',
  statusCheckRollup: null,
  needsRereview: false,
  newCommentsSincePush: 0,
  ...over,
})

describe('getCiStatusKind', () => {
  it('returns null when statusCheckRollup is null', () => {
    expect(getCiStatusKind(make() as PullRequest)).toBeNull()
  })

  it('maps SUCCESS to success', () => {
    expect(getCiStatusKind(make({ statusCheckRollup: { state: 'SUCCESS' } }) as PullRequest)).toBe('success')
  })

  it('maps PENDING and EXPECTED to pending', () => {
    expect(getCiStatusKind(make({ statusCheckRollup: { state: 'PENDING' } }) as PullRequest)).toBe('pending')
    expect(getCiStatusKind(make({ statusCheckRollup: { state: 'EXPECTED' } }) as PullRequest)).toBe('pending')
  })

  it('maps FAILURE and ERROR to failure', () => {
    expect(getCiStatusKind(make({ statusCheckRollup: { state: 'FAILURE' } }) as PullRequest)).toBe('failure')
    expect(getCiStatusKind(make({ statusCheckRollup: { state: 'ERROR' } }) as PullRequest)).toBe('failure')
  })
})

describe('getReviewBadgeLabel', () => {
  it('returns Draft when isDraft is true (short-circuits over reviewDecision)', () => {
    const pr = make({ isDraft: true, reviewDecision: 'APPROVED' }) as PullRequest
    expect(getReviewBadgeLabel(pr)).toBe('Draft')
  })

  it('maps APPROVED to Approved', () => {
    expect(getReviewBadgeLabel(make({ reviewDecision: 'APPROVED' }) as PullRequest)).toBe('Approved')
  })

  it('maps CHANGES_REQUESTED to Changes requested', () => {
    expect(getReviewBadgeLabel(make({ reviewDecision: 'CHANGES_REQUESTED' }) as PullRequest)).toBe('Changes requested')
  })

  it('maps REVIEW_REQUIRED and null to Review pending', () => {
    expect(getReviewBadgeLabel(make({ reviewDecision: 'REVIEW_REQUIRED' }) as PullRequest)).toBe('Review pending')
    expect(getReviewBadgeLabel(make({ reviewDecision: null }) as PullRequest)).toBe('Review pending')
  })
})

describe('getContextualHint', () => {
  it('returns null when nothing applies', () => {
    expect(getContextualHint(make() as PullRequest)).toBeNull()
  })

  it('returns merge conflict when mergeable is CONFLICTING', () => {
    expect(getContextualHint(make({ mergeable: 'CONFLICTING' }) as PullRequest)).toEqual([
      { kind: 'text', value: 'merge conflict' },
    ])
  })

  it('returns re-review hint when needsRereview is true', () => {
    expect(getContextualHint(make({ needsRereview: true }) as PullRequest)).toEqual([
      { kind: 'text', value: 're-review (new commits since you reviewed)' },
    ])
  })

  it('returns new comments hint with correct pluralization', () => {
    expect(getContextualHint(make({ newCommentsSincePush: 1 }) as PullRequest)).toEqual([
      { kind: 'mono', value: '1' },
      { kind: 'text', value: ' new comment since your last push' },
    ])
    expect(getContextualHint(make({ newCommentsSincePush: 3 }) as PullRequest)).toEqual([
      { kind: 'mono', value: '3' },
      { kind: 'text', value: ' new comments since your last push' },
    ])
  })

  it('conflict beats re-review', () => {
    const pr = make({ mergeable: 'CONFLICTING', needsRereview: true }) as PullRequest
    expect(getContextualHint(pr)).toEqual([{ kind: 'text', value: 'merge conflict' }])
  })

  it('re-review beats new comments', () => {
    const pr = make({ needsRereview: true, newCommentsSincePush: 5 }) as PullRequest
    expect(getContextualHint(pr)).toEqual([
      { kind: 'text', value: 're-review (new commits since you reviewed)' },
    ])
  })
})

describe('formatHandleList', () => {
  it('returns empty string for empty list', () => {
    expect(formatHandleList([])).toBe('')
  })

  it('shows a single handle as @x', () => {
    expect(formatHandleList(['ada'])).toBe('@ada')
  })

  it('shows two handles as @x, @y', () => {
    expect(formatHandleList(['ada', 'grace'])).toBe('@ada, @grace')
  })

  it('truncates to first 2 with +N more by default', () => {
    expect(formatHandleList(['ada', 'grace', 'lin', 'mae'])).toBe('@ada, @grace +2 more')
  })

  it('respects custom max', () => {
    expect(formatHandleList(['a', 'b', 'c', 'd'], 1)).toBe('@a +3 more')
    expect(formatHandleList(['a', 'b', 'c'], 3)).toBe('@a, @b, @c')
  })
})

describe('formatRequestedReviewers', () => {
  it('formats users, bots, and teams uniformly with handle prefix', () => {
    const reviewers = [
      { kind: 'User' as const, handle: 'ada' },
      { kind: 'Bot' as const, handle: 'renovate' },
      { kind: 'Team' as const, handle: 'platform' },
    ]
    expect(formatRequestedReviewers(reviewers, 3)).toBe('@ada, @renovate, @platform')
  })

  it('truncates with +N more', () => {
    const reviewers = [
      { kind: 'User' as const, handle: 'a' },
      { kind: 'User' as const, handle: 'b' },
      { kind: 'User' as const, handle: 'c' },
    ]
    expect(formatRequestedReviewers(reviewers)).toBe('@a, @b +1 more')
  })
})

describe('getBucketMetaSuffix', () => {
  const baseExtras = {
    requestedReviewers: [],
    commitsTotalCount: 0,
    unresolvedThreadCount: 0,
    unresolvedThreadAuthors: [],
  }

  it('returns null for review and ready buckets', () => {
    const pr = { ...make(), ...baseExtras } as unknown as PullRequest
    expect(getBucketMetaSuffix(pr, 'review')).toBeNull()
    expect(getBucketMetaSuffix(pr, 'ready')).toBeNull()
  })

  it('returns null for waiting when no reviewers requested', () => {
    const pr = { ...make(), ...baseExtras } as unknown as PullRequest
    expect(getBucketMetaSuffix(pr, 'waiting')).toBeNull()
  })

  it('formats requested reviewers for waiting bucket', () => {
    const pr = {
      ...make(),
      ...baseExtras,
      requestedReviewers: [
        { kind: 'User' as const, handle: 'ada' },
        { kind: 'User' as const, handle: 'grace' },
      ],
    } as unknown as PullRequest
    expect(getBucketMetaSuffix(pr, 'waiting')).toEqual([
      { kind: 'text', value: 'requested: @ada, @grace' },
    ])
  })

  it('formats commit count for drafts (singular and plural)', () => {
    const single = { ...make(), ...baseExtras, commitsTotalCount: 1 } as unknown as PullRequest
    const many = { ...make(), ...baseExtras, commitsTotalCount: 4 } as unknown as PullRequest
    expect(getBucketMetaSuffix(single, 'drafts')).toEqual([
      { kind: 'mono', value: '1' },
      { kind: 'text', value: ' commit' },
    ])
    expect(getBucketMetaSuffix(many, 'drafts')).toEqual([
      { kind: 'mono', value: '4' },
      { kind: 'text', value: ' commits' },
    ])
  })

  it('returns null for attention when no unresolved threads', () => {
    const pr = { ...make(), ...baseExtras } as unknown as PullRequest
    expect(getBucketMetaSuffix(pr, 'attention')).toBeNull()
  })

  it('formats unresolved with author attribution for attention', () => {
    const pr = {
      ...make(),
      ...baseExtras,
      unresolvedThreadCount: 3,
      unresolvedThreadAuthors: ['reviewer1', 'reviewer2'],
    } as unknown as PullRequest
    expect(getBucketMetaSuffix(pr, 'attention')).toEqual([
      { kind: 'mono', value: '3' },
      { kind: 'text', value: ' unresolved comments' },
      { kind: 'text', value: ' from @reviewer1, @reviewer2' },
    ])
  })

  it('formats unresolved without authors when list is empty', () => {
    const pr = {
      ...make(),
      ...baseExtras,
      unresolvedThreadCount: 1,
      unresolvedThreadAuthors: [],
    } as unknown as PullRequest
    expect(getBucketMetaSuffix(pr, 'attention')).toEqual([
      { kind: 'mono', value: '1' },
      { kind: 'text', value: ' unresolved comment' },
    ])
  })
})

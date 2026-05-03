import { describe, expect, it } from 'vitest'
import { transform } from '../transform.js'
import { makeRawPr, makeRawResponse } from './fixtures.js'

describe('transform', () => {
  it('my draft → drafts', () => {
    const result = transform(
      makeRawResponse({
        authored: [makeRawPr({ id: '1', isDraft: true, author: { login: 'me' } })],
      }),
    )
    expect(result.pullRequests).toHaveLength(1)
    expect(result.pullRequests[0]?.bucket).toBe('drafts')
  })

  it('viewer requested as User → review', () => {
    const result = transform(
      makeRawResponse({
        reviewRequested: [
          makeRawPr({
            id: '2',
            author: { login: 'someone-else' },
            reviewRequests: {
              nodes: [{ requestedReviewer: { __typename: 'User', login: 'me' } }],
            },
          }),
        ],
      }),
    )
    expect(result.pullRequests[0]?.bucket).toBe('review')
    expect(result.pullRequests[0]?.viewerIsRequestedReviewer).toBe(true)
  })

  it('viewer reviewed previously, new commits since → review (needsRereview)', () => {
    const result = transform(
      makeRawResponse({
        reviewedBy: [
          makeRawPr({
            id: '3',
            author: { login: 'someone-else' },
            commits: { nodes: [{ commit: { committedDate: '2026-02-01T00:00:00Z' } }] },
            reviews: {
              nodes: [
                { state: 'APPROVED', submittedAt: '2026-01-15T00:00:00Z', author: { login: 'me' } },
              ],
            },
          }),
        ],
      }),
    )
    expect(result.pullRequests[0]?.bucket).toBe('review')
    expect(result.pullRequests[0]?.needsRereview).toBe(true)
    expect(result.pullRequests[0]?.viewerHasReviewed).toBe(true)
  })

  it('my PR with mixed comments since push (issue + thread, self ignored) → attention', () => {
    const since = '2026-01-01T00:00:00Z'
    const after = '2026-01-02T00:00:00Z'
    const result = transform(
      makeRawResponse({
        authored: [
          makeRawPr({
            id: '4',
            author: { login: 'me' },
            commits: { nodes: [{ commit: { committedDate: since } }] },
            comments: {
              totalCount: 2,
              nodes: [
                { createdAt: after, author: { login: 'reviewer1' } },
                { createdAt: after, author: { login: 'me' } },
              ],
            },
            reviewThreads: {
              nodes: [
                {
                  isResolved: false,
                  comments: {
                    nodes: [
                      { createdAt: after, author: { login: 'reviewer2' } },
                      { createdAt: after, author: { login: 'reviewer3' } },
                    ],
                  },
                },
              ],
            },
          }),
        ],
      }),
    )
    expect(result.pullRequests[0]?.newCommentsSincePush).toBe(3)
    expect(result.pullRequests[0]?.bucket).toBe('attention')
  })

  it('my PR APPROVED + SUCCESS but mergeable=UNKNOWN → waiting (not ready)', () => {
    const result = transform(
      makeRawResponse({
        authored: [
          makeRawPr({
            id: '5',
            author: { login: 'me' },
            reviewDecision: 'APPROVED',
            mergeable: 'UNKNOWN',
            statusCheckRollup: { state: 'SUCCESS' },
          }),
        ],
      }),
    )
    expect(result.pullRequests[0]?.bucket).toBe('waiting')
  })

  it('ghost author (null) — viewer requested → review', () => {
    const result = transform(
      makeRawResponse({
        reviewRequested: [
          makeRawPr({
            id: '6',
            author: null,
            reviewRequests: {
              nodes: [{ requestedReviewer: { __typename: 'User', login: 'me' } }],
            },
          }),
        ],
      }),
    )
    expect(result.pullRequests[0]?.author).toBe(null)
    expect(result.pullRequests[0]?.bucket).toBe('review')
  })

  it('Team requested reviewer does not count as viewerIsRequestedReviewer', () => {
    const result = transform(
      makeRawResponse({
        reviewedBy: [
          makeRawPr({
            id: '7',
            author: { login: 'someone-else' },
            reviewRequests: {
              nodes: [{ requestedReviewer: { __typename: 'Team', slug: 'my-team' } }],
            },
          }),
        ],
      }),
    )
    expect(result.pullRequests).toHaveLength(0)
  })

  it('viewerLatestReviewSubmittedAt picks max across multiple viewer reviews', () => {
    const result = transform(
      makeRawResponse({
        reviewedBy: [
          makeRawPr({
            id: '8',
            author: { login: 'someone-else' },
            commits: { nodes: [{ commit: { committedDate: '2026-02-01T00:00:00Z' } }] },
            reviews: {
              nodes: [
                { state: 'COMMENTED', submittedAt: '2026-01-15T00:00:00Z', author: { login: 'me' } },
                { state: 'APPROVED', submittedAt: '2026-01-20T00:00:00Z', author: { login: 'me' } },
                { state: 'COMMENTED', submittedAt: '2026-01-10T00:00:00Z', author: { login: 'me' } },
                { state: 'PENDING', submittedAt: null, author: { login: 'me' } },
                { state: 'APPROVED', submittedAt: '2026-01-25T00:00:00Z', author: { login: 'someone-else' } },
              ],
            },
          }),
        ],
      }),
    )
    expect(result.pullRequests[0]?.viewerLatestReviewSubmittedAt).toBe('2026-01-20T00:00:00Z')
    expect(result.pullRequests[0]?.needsRereview).toBe(true)
  })

  it('dedupes PR appearing in multiple search results', () => {
    const pr = makeRawPr({ id: 'PR_dup', isDraft: true, author: { login: 'me' } })
    const result = transform(
      makeRawResponse({
        authored: [pr],
        reviewedBy: [pr],
      }),
    )
    expect(result.pullRequests).toHaveLength(1)
  })

  it('my PR with CHANGES_REQUESTED → attention', () => {
    const result = transform(
      makeRawResponse({
        authored: [
          makeRawPr({
            id: '10',
            author: { login: 'me' },
            reviewDecision: 'CHANGES_REQUESTED',
          }),
        ],
      }),
    )
    expect(result.pullRequests[0]?.bucket).toBe('attention')
  })

  it('my PR APPROVED + SUCCESS + MERGEABLE → ready', () => {
    const result = transform(
      makeRawResponse({
        authored: [
          makeRawPr({
            id: '11',
            author: { login: 'me' },
            reviewDecision: 'APPROVED',
            mergeable: 'MERGEABLE',
            statusCheckRollup: { state: 'SUCCESS' },
          }),
        ],
      }),
    )
    expect(result.pullRequests[0]?.bucket).toBe('ready')
  })

  it('drops others PR I reviewed previously with no new commits, not requested', () => {
    const result = transform(
      makeRawResponse({
        reviewedBy: [
          makeRawPr({
            id: '12',
            author: { login: 'someone-else' },
            commits: { nodes: [{ commit: { committedDate: '2026-01-01T00:00:00Z' } }] },
            reviews: {
              nodes: [
                { state: 'APPROVED', submittedAt: '2026-01-15T00:00:00Z', author: { login: 'me' } },
              ],
            },
          }),
        ],
      }),
    )
    expect(result.pullRequests).toHaveLength(0)
  })

  it('counts unresolved review threads correctly', () => {
    const result = transform(
      makeRawResponse({
        authored: [
          makeRawPr({
            id: '13',
            author: { login: 'me' },
            reviewThreads: {
              nodes: [
                { isResolved: true, comments: { nodes: [] } },
                { isResolved: false, comments: { nodes: [] } },
                { isResolved: false, comments: { nodes: [] } },
                { isResolved: true, comments: { nodes: [] } },
              ],
            },
          }),
        ],
      }),
    )
    expect(result.pullRequests[0]?.unresolvedThreadCount).toBe(2)
  })
})

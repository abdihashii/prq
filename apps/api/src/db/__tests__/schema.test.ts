import { getTableName } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import {
  autoRetargetEvents,
  autoRetargetStatusEnum,
  githubInstallations,
  githubUsers,
  pullRequestReviewRequests,
  pullRequestReviews,
  pullRequests,
  repositories,
  requestedReviewerKindEnum,
  reviewDecisionEnum,
  webhookDeliveries,
} from '../schema'

describe('database schema', () => {
  it('exports the hosted PRQ foundation tables', () => {
    expect([
      githubUsers,
      githubInstallations,
      repositories,
      pullRequests,
      pullRequestReviewRequests,
      pullRequestReviews,
      webhookDeliveries,
      autoRetargetEvents,
    ].map(getTableName)).toEqual([
      'github_users',
      'github_installations',
      'repositories',
      'pull_requests',
      'pull_request_review_requests',
      'pull_request_reviews',
      'webhook_deliveries',
      'auto_retarget_events',
    ])
  })

  it('keeps existing dashboard enum policy available for stored PR snapshots', () => {
    expect(reviewDecisionEnum.enumValues).toEqual([
      'APPROVED',
      'CHANGES_REQUESTED',
      'REVIEW_REQUIRED',
    ])
    expect(requestedReviewerKindEnum.enumValues).toEqual([
      'User',
      'Bot',
      'Mannequin',
      'Team',
    ])
  })

  it('models later webhook and retarget audit state without runtime behavior', () => {
    expect(autoRetargetStatusEnum.enumValues).toEqual([
      'succeeded',
      'failed',
      'skipped',
    ])
  })
})

import { z } from 'zod'
import { BucketSchema } from './bucket.js'

export const PullRequestSchema = z.object({
  id: z.string(),
  number: z.number().int(),
  title: z.string(),
  url: z.url(),
  repository: z.object({
    owner: z.string(),
    name: z.string(),
  }),
  author: z.object({ login: z.string() }).nullable(),
  baseRefName: z.string(),
  isDraft: z.boolean(),
  updatedAt: z.iso.datetime(),
  reviewDecision: z.enum(['APPROVED', 'CHANGES_REQUESTED', 'REVIEW_REQUIRED']).nullable(),
  mergeable: z.enum(['MERGEABLE', 'CONFLICTING', 'UNKNOWN']),
  statusCheckRollup: z
    .object({
      state: z.enum(['SUCCESS', 'PENDING', 'FAILURE', 'ERROR', 'EXPECTED']),
    })
    .nullable(),
  latestCommit: z.object({ committedDate: z.iso.datetime() }).nullable(),
  commentsTotalCount: z.number().int().nonnegative(),

  bucket: BucketSchema,
  viewerHasReviewed: z.boolean(),
  viewerLatestReviewSubmittedAt: z.iso.datetime().nullable(),
  viewerIsRequestedReviewer: z.boolean(),
  needsRereview: z.boolean(),
  newCommentsSincePush: z.number().int().nonnegative(),
  unresolvedThreadCount: z.number().int().nonnegative(),
})

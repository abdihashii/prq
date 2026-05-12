import type { z } from 'zod'
import type { PullRequestSchema, RequestedReviewerSchema } from '../schemas/pullRequest'

export type PullRequest = z.infer<typeof PullRequestSchema>
export type RequestedReviewer = z.infer<typeof RequestedReviewerSchema>

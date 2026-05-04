import type { z } from 'zod'
import type { PullRequestSchema, RequestedReviewerSchema } from '../schemas/pullRequest.js'

export type PullRequest = z.infer<typeof PullRequestSchema>
export type RequestedReviewer = z.infer<typeof RequestedReviewerSchema>

import type { z } from 'zod'
import type { PullRequestSchema } from '../schemas/pullRequest.js'

export type PullRequest = z.infer<typeof PullRequestSchema>

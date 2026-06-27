import { z } from 'zod'
import type {
  DashboardBuckets,
  DashboardItem,
  DashboardResponse,
  StackNode,
} from '../types/dashboard'
import { RateLimitSchema } from './contract'
import { InstallationSchema } from './installation'
import { PullRequestSchema } from './pullRequest'
import { TrackableRepoSchema } from './trackableRepo'

export const StackNodeSchema: z.ZodType<StackNode> = z.lazy(() =>
  z.object({
    pr: PullRequestSchema,
    children: z.array(StackNodeSchema),
  }),
)

export const DashboardItemSchema: z.ZodType<DashboardItem> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('pr'), pr: PullRequestSchema }),
  z.object({ kind: z.literal('stack'), root: StackNodeSchema }),
])

export const DashboardBucketsSchema: z.ZodType<DashboardBuckets> = z.object({
  review: z.array(DashboardItemSchema),
  attention: z.array(DashboardItemSchema),
  ready: z.array(DashboardItemSchema),
  waiting: z.array(DashboardItemSchema),
  drafts: z.array(DashboardItemSchema),
})

export const DashboardResponseSchema: z.ZodType<DashboardResponse> = z.object({
  buckets: DashboardBucketsSchema,
  viewerLogin: z.string(),
  syncedAt: z.iso.datetime(),
  githubSyncedAt: z.iso.datetime().nullable(),
  rateLimit: RateLimitSchema,
  trackableRepos: z.array(TrackableRepoSchema),
  installations: z.array(InstallationSchema),
})

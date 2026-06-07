import type { Bucket } from './bucket'
import type { RateLimit } from './contract'
import type { PullRequest } from './pullRequest'
import type { TrackableRepo } from './trackableRepo'

export interface StackNode {
  pr: PullRequest
  children: StackNode[]
}

export type DashboardItem =
  | { kind: 'pr', pr: PullRequest }
  | { kind: 'stack', root: StackNode }

export type DashboardBuckets = Record<Bucket, DashboardItem[]>

export interface DashboardResponse {
  buckets: DashboardBuckets
  viewerLogin: string
  syncedAt: string
  rateLimit: RateLimit
  trackableRepos: TrackableRepo[]
}

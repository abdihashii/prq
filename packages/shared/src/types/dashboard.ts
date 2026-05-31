import type { Bucket } from './bucket'
import type { BucketedResponse } from './contract'
import type { PullRequest } from './pullRequest'

export interface StackNode {
  pr: PullRequest
  children: StackNode[]
}

export type DashboardItem =
  | { kind: 'pr', pr: PullRequest }
  | { kind: 'stack', root: StackNode }

export type DashboardBuckets = Record<Bucket, DashboardItem[]>

export type DashboardResponse = Omit<BucketedResponse, 'buckets'> & {
  buckets: DashboardBuckets
}

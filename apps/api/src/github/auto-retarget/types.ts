export type AutoRetargetResult = 'succeeded' | 'skipped' | 'already-complete'

export interface MergedParentRetarget {
  deliveryId: string
  parentPullRequestId: string
  desiredBaseRefName: string
}

export interface AutoRetargetService {
  retargetMergedParent(args: MergedParentRetarget): Promise<AutoRetargetResult>
}

export interface AutoRetargetWorker {
  runOnce(): Promise<number>
}

export interface AutoRetargetTarget {
  attemptId: number
  githubInstallationId: string
  repositoryOwner: string
  repositoryName: string
  childPullRequestId: string
  childNumber: number
  previousBaseRefName: string
  nextBaseRefName: string
}

export interface RemotePullRequest {
  state: 'OPEN' | 'CLOSED' | 'MERGED'
  baseRefName: string
  githubUpdatedAt: Date
}

export interface GitHubRetargetClient {
  inspect(target: AutoRetargetTarget): Promise<RemotePullRequest>
  retarget(target: AutoRetargetTarget): Promise<RemotePullRequest>
}

export type AutoRetargetStep =
  | { kind: 'continue', attemptId: number }
  | { kind: AutoRetargetResult }
  | { kind: 'failed', message: string }

export interface AutoRetargetStore {
  loadWork(): Promise<MergedParentRetarget[]>
  prepare(args: MergedParentRetarget, now: Date): Promise<AutoRetargetStep>
  validate(
    attemptId: number,
    inspect: (target: AutoRetargetTarget) => Promise<RemotePullRequest>,
    now: Date,
  ): Promise<AutoRetargetStep>
  apply(
    attemptId: number,
    inspect: (target: AutoRetargetTarget) => Promise<RemotePullRequest>,
    retarget: (target: AutoRetargetTarget) => Promise<RemotePullRequest>,
    now: Date,
  ): Promise<AutoRetargetStep>
}

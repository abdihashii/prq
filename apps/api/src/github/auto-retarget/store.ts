import {
  and,
  asc,
  desc,
  eq,
  inArray,
  lte,
  ne,
} from 'drizzle-orm'
import { getDatabase, type Database } from '../../db'
import {
  autoRetargetEvents,
  githubInstallations,
  pullRequests,
  repositories,
} from '../../db/schema'
import type {
  AutoRetargetStep,
  AutoRetargetStore,
  AutoRetargetTarget,
  MergedParentRetarget,
  RemotePullRequest,
} from './types'

const MAX_ERROR_MESSAGE_LENGTH = 1000
type AutoRetargetDb = Pick<Database, 'insert' | 'select' | 'update'>
interface StoredParent {
  id: string
  repositoryId: string
  state: 'OPEN' | 'CLOSED' | 'MERGED'
  baseRefName: string
  headRefName: string
  headRepositoryOwner: string | null
  headRepositoryName: string | null
  repositoryOwner: string
  repositoryName: string
  repositoryArchived: boolean
  repositoryReconciledAt: Date | null
  githubInstallationId: string | null
  installationActive: boolean | null
  installationSuspendedAt: Date | null
}
interface AuditAttempt {
  githubPullRequestId: string | null
  parentGithubPullRequestId: string | null
  deliveryId: string | null
  previousBaseRefName: string | null
  nextBaseRefName: string
  errorMessage: string | null
}

/**
 * Parent locks serialize attempt creation. An applying event means a GitHub
 * mutation may have happened, so retries always re-inspect before PATCHing.
 */
export function createDrizzleAutoRetargetStore(
  db: Database = getDatabase().db,
): AutoRetargetStore {
  return {
    async loadWork() {
      return db.transaction(async (tx) => loadWork(tx))
    },

    async prepare(args, now) {
      return db.transaction(async (tx) => prepareAttempt(tx, args, now))
    },

    async validate(attemptId, inspect, now) {
      return db.transaction(async (tx) => {
        const attempt = await lockedAttempt(tx, attemptId)
        if (attempt.kind !== 'active') return attempt.step
        if (attempt.status === 'applying') return { kind: 'continue', attemptId }

        const target = await loadTarget(tx, attemptId, false)
        if (target.kind === 'unavailable') {
          return finishSkipped(tx, attemptId, target.reason)
        }

        const inspected = await callGitHub(tx, target.target, () => inspect(target.target), now)
        if (inspected.kind === 'failed') return inspected

        const skipReason = remoteSkipReason(inspected.pullRequest, target.target)
        if (skipReason !== null) return finishSkipped(tx, attemptId, skipReason)

        await tx.update(autoRetargetEvents).set({
          status: 'applying',
          errorMessage: null,
        }).where(eq(autoRetargetEvents.id, attemptId))
        return { kind: 'continue', attemptId }
      })
    },

    async apply(attemptId, inspect, retarget, now) {
      return db.transaction(async (tx) => {
        const attempt = await lockedAttempt(tx, attemptId)
        if (attempt.kind !== 'active') return attempt.step
        if (attempt.status !== 'applying') {
          return finishFailed(tx, attemptId, 'Auto-retarget attempt was not ready to apply')
        }

        const target = await loadTarget(tx, attemptId, true)
        if (target.kind === 'unavailable') {
          return finishSkipped(tx, attemptId, target.reason)
        }

        const inspected = await inspectApplying(tx, target.target, inspect, now)
        if (inspected.kind === 'failed') return inspected
        if (inspected.pullRequest.baseRefName === target.target.nextBaseRefName) {
          await finishSucceeded(tx, target.target, inspected.pullRequest, now)
          return { kind: 'succeeded' }
        }

        const skipReason = remoteSkipReason(inspected.pullRequest, target.target)
        if (skipReason !== null) return finishSkipped(tx, attemptId, skipReason)

        let updated: RemotePullRequest
        try {
          updated = await retarget(target.target)
        }
        catch (error) {
          return recoverMutationFailure(tx, target.target, inspect, error, now)
        }
        if (updated.baseRefName === target.target.nextBaseRefName) {
          await finishSucceeded(tx, target.target, updated, now)
          return { kind: 'succeeded' }
        }
        if (updated.state !== 'OPEN') return finishSkipped(tx, attemptId, 'child_is_not_open')
        return recordRetryableFailure(
          tx,
          attemptId,
          'GitHub did not apply the requested pull request base',
          now,
        )
      })
    },
  }
}

async function loadWork(db: AutoRetargetDb): Promise<MergedParentRetarget[]> {
  const rows = await db.select({
    id: autoRetargetEvents.id,
    deliveryId: autoRetargetEvents.deliveryId,
    parentPullRequestId: autoRetargetEvents.parentGithubPullRequestId,
    desiredBaseRefName: autoRetargetEvents.nextBaseRefName,
  }).from(autoRetargetEvents)
    .where(inArray(autoRetargetEvents.status, ['pending', 'applying']))
    .orderBy(asc(autoRetargetEvents.id))

  const work: MergedParentRetarget[] = []
  for (const row of rows) {
    if (row.deliveryId === null || row.parentPullRequestId === null) {
      await finishSkipped(db, row.id, 'required_state_unavailable')
    }
    else {
      work.push({
        deliveryId: row.deliveryId,
        parentPullRequestId: row.parentPullRequestId,
        desiredBaseRefName: row.desiredBaseRefName,
      })
    }
  }
  return work
}

async function prepareAttempt(
  db: AutoRetargetDb,
  args: MergedParentRetarget,
  now: Date,
): Promise<AutoRetargetStep> {
  const [parent]: StoredParent[] = await db.select({
    id: pullRequests.githubPullRequestId,
    repositoryId: pullRequests.githubRepositoryId,
    state: pullRequests.state,
    baseRefName: pullRequests.baseRefName,
    headRefName: pullRequests.headRefName,
    headRepositoryOwner: pullRequests.headRepositoryOwner,
    headRepositoryName: pullRequests.headRepositoryName,
    repositoryOwner: repositories.owner,
    repositoryName: repositories.name,
    repositoryArchived: repositories.archived,
    repositoryReconciledAt: repositories.dashboardReconciledAt,
    githubInstallationId: repositories.githubInstallationId,
    installationActive: githubInstallations.active,
    installationSuspendedAt: githubInstallations.suspendedAt,
  }).from(pullRequests)
    .innerJoin(repositories, eq(pullRequests.githubRepositoryId, repositories.githubRepositoryId))
    .leftJoin(
      githubInstallations,
      eq(repositories.githubInstallationId, githubInstallations.githubInstallationId),
    )
    .where(eq(pullRequests.githubPullRequestId, args.parentPullRequestId))
    .limit(1)
    .for('update', { of: pullRequests })

  if (!parent) return insertUnlinkedSkip(db, args, 'required_state_unavailable', now)

  const [succeeded] = await db.select({ id: autoRetargetEvents.id })
    .from(autoRetargetEvents)
    .where(and(
      eq(autoRetargetEvents.parentGithubPullRequestId, parent.id),
      eq(autoRetargetEvents.status, 'succeeded'),
    ))
    .limit(1)
  if (succeeded) return { kind: 'already-complete' }

  const [active] = await db.select({
    id: autoRetargetEvents.id,
    status: autoRetargetEvents.status,
    childPullRequestId: autoRetargetEvents.githubPullRequestId,
    previousBaseRefName: autoRetargetEvents.previousBaseRefName,
  })
    .from(autoRetargetEvents)
    .where(and(
      eq(autoRetargetEvents.parentGithubPullRequestId, parent.id),
      inArray(autoRetargetEvents.status, ['pending', 'applying']),
    ))
    .limit(1)
  if (active) {
    if (active.status === 'applying'
      || (active.childPullRequestId !== null && active.previousBaseRefName !== null)) {
      return { kind: 'continue', attemptId: active.id }
    }
    return preparePendingAttempt(db, active.id, args, parent, now)
  }

  const [sameDeliverySkip] = await db.select({ id: autoRetargetEvents.id })
    .from(autoRetargetEvents)
    .where(and(
      eq(autoRetargetEvents.parentGithubPullRequestId, parent.id),
      eq(autoRetargetEvents.deliveryId, args.deliveryId),
      eq(autoRetargetEvents.status, 'skipped'),
    ))
    .orderBy(desc(autoRetargetEvents.id))
    .limit(1)
  if (sameDeliverySkip) return { kind: 'skipped' }

  const [attempt] = await db.insert(autoRetargetEvents).values({
    parentGithubPullRequestId: parent.id,
    deliveryId: args.deliveryId,
    nextBaseRefName: args.desiredBaseRefName,
    status: 'pending',
    createdAt: now,
  }).returning({ id: autoRetargetEvents.id })
  if (!attempt) throw new Error('Failed to create auto-retarget attempt')
  return preparePendingAttempt(db, attempt.id, args, parent, now)
}

async function preparePendingAttempt(
  db: AutoRetargetDb,
  attemptId: number,
  args: MergedParentRetarget,
  parent: StoredParent,
  now: Date,
): Promise<AutoRetargetStep> {
  if (parent.state !== 'MERGED') {
    return finishPreparedSkip(db, attemptId, null, null, 'parent_is_not_merged')
  }
  if (parent.baseRefName !== args.desiredBaseRefName) {
    return finishPreparedSkip(
      db,
      attemptId,
      null,
      null,
      'parent_base_no_longer_matches_delivery',
    )
  }
  if (!sameRepository(
    parent.repositoryOwner,
    parent.repositoryName,
    parent.headRepositoryOwner,
    parent.headRepositoryName,
  )) {
    return finishPreparedSkip(
      db,
      attemptId,
      null,
      null,
      'parent_head_repository_is_not_the_base_repository',
    )
  }
  const candidates = await db.select({
    id: pullRequests.githubPullRequestId,
    baseRefName: pullRequests.baseRefName,
    state: pullRequests.state,
  }).from(pullRequests).where(and(
    eq(pullRequests.githubRepositoryId, parent.repositoryId),
    eq(pullRequests.baseRefName, parent.headRefName),
    ne(pullRequests.githubPullRequestId, parent.id),
  ))
  const openCandidates = candidates.filter(candidate => candidate.state === 'OPEN')

  if (openCandidates.length > 1) {
    return finishPreparedSkip(db, attemptId, null, null, 'multiple_direct_children')
  }
  if (openCandidates.length === 0 && parent.repositoryReconciledAt === null) {
    return recordDeferredSkip(db, attemptId, 'repository_state_unavailable', now)
  }
  if (openCandidates.length === 0 && candidates.length > 1) {
    return finishPreparedSkip(db, attemptId, null, null, 'multiple_direct_children')
  }
  if (openCandidates.length === 0 && candidates.length === 1) {
    const child = candidates[0]!
    return finishPreparedSkip(db, attemptId, child.id, child.baseRefName, 'child_is_not_open')
  }
  if (openCandidates.length === 0) {
    return finishPreparedSkip(db, attemptId, null, null, 'no_direct_child')
  }

  const child = openCandidates[0]!
  if (!repositoryAvailable(parent)) {
    return finishPreparedSkip(
      db,
      attemptId,
      child.id,
      child.baseRefName,
      'repository_or_installation_unavailable',
    )
  }
  if (child.baseRefName === args.desiredBaseRefName) {
    return finishPreparedSkip(
      db,
      attemptId,
      child.id,
      child.baseRefName,
      'already_targeting_desired_base',
    )
  }

  await db.update(autoRetargetEvents).set({
    githubPullRequestId: child.id,
    previousBaseRefName: child.baseRefName,
    errorMessage: null,
  }).where(eq(autoRetargetEvents.id, attemptId))
  return { kind: 'continue', attemptId }
}

async function insertUnlinkedSkip(
  db: AutoRetargetDb,
  args: MergedParentRetarget,
  reason: string,
  now: Date,
): Promise<AutoRetargetStep> {
  await db.insert(autoRetargetEvents).values({
    deliveryId: args.deliveryId,
    nextBaseRefName: args.desiredBaseRefName,
    status: 'skipped',
    errorMessage: reason,
    createdAt: now,
  })
  return { kind: 'skipped' }
}

async function finishPreparedSkip(
  db: AutoRetargetDb,
  attemptId: number,
  childPullRequestId: string | null,
  previousBaseRefName: string | null,
  reason: string,
): Promise<AutoRetargetStep> {
  await db.update(autoRetargetEvents).set({
    githubPullRequestId: childPullRequestId,
    previousBaseRefName,
    status: 'skipped',
    errorMessage: reason,
  }).where(eq(autoRetargetEvents.id, attemptId))
  return { kind: 'skipped' }
}

async function lockedAttempt(
  db: AutoRetargetDb,
  attemptId: number,
): Promise<
  | { kind: 'active', status: 'pending' | 'applying' }
  | { kind: 'terminal', step: AutoRetargetStep }
> {
  const [attempt] = await db.select({ status: autoRetargetEvents.status })
    .from(autoRetargetEvents)
    .where(eq(autoRetargetEvents.id, attemptId))
    .limit(1)
    .for('update')
  if (!attempt) throw new Error(`Auto-retarget attempt ${attemptId} is unavailable`)

  if (attempt.status === 'pending' || attempt.status === 'applying') {
    return { kind: 'active', status: attempt.status }
  }
  if (attempt.status === 'succeeded') {
    return { kind: 'terminal', step: { kind: 'already-complete' } }
  }
  if (attempt.status === 'skipped') return { kind: 'terminal', step: { kind: 'skipped' } }
  return {
    kind: 'terminal',
    step: { kind: 'failed', message: 'Previous auto-retarget attempt failed' },
  }
}

async function loadTarget(
  db: AutoRetargetDb,
  attemptId: number,
  allowRemoteRecovery: boolean,
): Promise<
  | { kind: 'target', target: AutoRetargetTarget }
  | { kind: 'unavailable', reason: string }
> {
  const [row] = await db.select({
    childPullRequestId: autoRetargetEvents.githubPullRequestId,
    previousBaseRefName: autoRetargetEvents.previousBaseRefName,
    nextBaseRefName: autoRetargetEvents.nextBaseRefName,
    childNumber: pullRequests.number,
    childState: pullRequests.state,
    childBaseRefName: pullRequests.baseRefName,
    repositoryOwner: repositories.owner,
    repositoryName: repositories.name,
    repositoryArchived: repositories.archived,
    githubInstallationId: repositories.githubInstallationId,
    installationActive: githubInstallations.active,
    installationSuspendedAt: githubInstallations.suspendedAt,
  }).from(autoRetargetEvents)
    .leftJoin(pullRequests, eq(autoRetargetEvents.githubPullRequestId, pullRequests.githubPullRequestId))
    .leftJoin(repositories, eq(pullRequests.githubRepositoryId, repositories.githubRepositoryId))
    .leftJoin(
      githubInstallations,
      eq(repositories.githubInstallationId, githubInstallations.githubInstallationId),
    )
    .where(eq(autoRetargetEvents.id, attemptId))
    .limit(1)

  if (!row
    || row.childPullRequestId === null
    || row.previousBaseRefName === null
    || row.childNumber === null
    || (!allowRemoteRecovery
      && (row.childState !== 'OPEN' || row.childBaseRefName !== row.previousBaseRefName))) {
    return { kind: 'unavailable', reason: 'child_relationship_unavailable' }
  }
  if (row.repositoryOwner === null
    || row.repositoryName === null
    || row.repositoryArchived !== false
    || row.githubInstallationId === null
    || row.installationActive !== true
    || row.installationSuspendedAt !== null) {
    return { kind: 'unavailable', reason: 'repository_or_installation_unavailable' }
  }

  return {
    kind: 'target',
    target: {
      attemptId,
      githubInstallationId: row.githubInstallationId,
      repositoryOwner: row.repositoryOwner,
      repositoryName: row.repositoryName,
      childPullRequestId: row.childPullRequestId,
      childNumber: row.childNumber,
      previousBaseRefName: row.previousBaseRefName,
      nextBaseRefName: row.nextBaseRefName,
    },
  }
}

function remoteSkipReason(
  pullRequest: RemotePullRequest,
  target: AutoRetargetTarget,
): string | null {
  if (pullRequest.state !== 'OPEN') return 'child_is_not_open'
  if (pullRequest.baseRefName === target.nextBaseRefName) return 'already_targeting_desired_base'
  if (pullRequest.baseRefName !== target.previousBaseRefName) {
    return 'child_no_longer_targets_parent_head'
  }
  return null
}

async function callGitHub(
  db: AutoRetargetDb,
  target: AutoRetargetTarget,
  operation: () => Promise<RemotePullRequest>,
  now: Date,
): Promise<{ kind: 'success', pullRequest: RemotePullRequest } | { kind: 'failed', message: string }> {
  try {
    return { kind: 'success', pullRequest: await operation() }
  }
  catch (error) {
    return recordRetryableFailure(db, target.attemptId, errorMessage(error), now)
  }
}

async function inspectApplying(
  db: AutoRetargetDb,
  target: AutoRetargetTarget,
  inspect: (target: AutoRetargetTarget) => Promise<RemotePullRequest>,
  now: Date,
): Promise<{ kind: 'success', pullRequest: RemotePullRequest } | { kind: 'failed', message: string }> {
  try {
    return { kind: 'success', pullRequest: await inspect(target) }
  }
  catch (error) {
    const message = errorMessage(error).slice(0, MAX_ERROR_MESSAGE_LENGTH)
    await recordAmbiguousFailure(db, target.attemptId, message, now)
    return { kind: 'failed', message }
  }
}

async function recoverMutationFailure(
  db: AutoRetargetDb,
  target: AutoRetargetTarget,
  inspect: (target: AutoRetargetTarget) => Promise<RemotePullRequest>,
  mutationError: unknown,
  now: Date,
): Promise<AutoRetargetStep> {
  const message = errorMessage(mutationError)
  let pullRequest: RemotePullRequest
  try {
    pullRequest = await inspect(target)
  }
  catch {
    await recordAmbiguousFailure(db, target.attemptId, message, now)
    return { kind: 'failed', message: message.slice(0, MAX_ERROR_MESSAGE_LENGTH) }
  }

  if (pullRequest.baseRefName === target.nextBaseRefName) {
    await finishSucceeded(db, target, pullRequest, now)
    return { kind: 'succeeded' }
  }
  const skipReason = remoteSkipReason(pullRequest, target)
  if (skipReason !== null) return finishSkipped(db, target.attemptId, skipReason)
  return recordRetryableFailure(db, target.attemptId, message, now)
}

async function recordAmbiguousFailure(
  db: AutoRetargetDb,
  attemptId: number,
  message: string,
  now: Date,
): Promise<void> {
  const bounded = await insertAuditOutcome(db, attemptId, 'failed', message, now)
  await db.update(autoRetargetEvents).set({
    errorMessage: bounded,
  }).where(eq(autoRetargetEvents.id, attemptId))
}

async function recordRetryableFailure(
  db: AutoRetargetDb,
  attemptId: number,
  message: string,
  now: Date,
): Promise<{ kind: 'failed', message: string }> {
  const bounded = await insertAuditOutcome(db, attemptId, 'failed', message, now)
  await db.update(autoRetargetEvents).set({
    status: 'pending',
    errorMessage: bounded,
  }).where(eq(autoRetargetEvents.id, attemptId))
  return { kind: 'failed', message: bounded }
}

async function recordDeferredSkip(
  db: AutoRetargetDb,
  attemptId: number,
  reason: string,
  now: Date,
): Promise<AutoRetargetStep> {
  const attempt = await loadAuditAttempt(db, attemptId)
  if (attempt.errorMessage !== reason) {
    await insertAuditOutcome(db, attemptId, 'skipped', reason, now, attempt)
  }
  await db.update(autoRetargetEvents).set({
    errorMessage: reason,
  }).where(eq(autoRetargetEvents.id, attemptId))
  return { kind: 'skipped' }
}

async function insertAuditOutcome(
  db: AutoRetargetDb,
  attemptId: number,
  status: 'failed' | 'skipped',
  message: string,
  now: Date,
  loadedAttempt?: AuditAttempt,
): Promise<string> {
  const bounded = message.slice(0, MAX_ERROR_MESSAGE_LENGTH)
  const attempt = loadedAttempt ?? await loadAuditAttempt(db, attemptId)
  await db.insert(autoRetargetEvents).values({
    ...attempt,
    status,
    errorMessage: bounded,
    createdAt: now,
  })
  return bounded
}

async function loadAuditAttempt(db: AutoRetargetDb, attemptId: number): Promise<AuditAttempt> {
  const [attempt]: AuditAttempt[] = await db.select({
    githubPullRequestId: autoRetargetEvents.githubPullRequestId,
    parentGithubPullRequestId: autoRetargetEvents.parentGithubPullRequestId,
    deliveryId: autoRetargetEvents.deliveryId,
    previousBaseRefName: autoRetargetEvents.previousBaseRefName,
    nextBaseRefName: autoRetargetEvents.nextBaseRefName,
    errorMessage: autoRetargetEvents.errorMessage,
  }).from(autoRetargetEvents)
    .where(eq(autoRetargetEvents.id, attemptId))
    .limit(1)
  if (!attempt) throw new Error(`Auto-retarget attempt ${attemptId} is unavailable`)
  return attempt
}

async function finishSucceeded(
  db: AutoRetargetDb,
  target: AutoRetargetTarget,
  pullRequest: RemotePullRequest,
  now: Date,
): Promise<void> {
  await db.update(pullRequests).set({
    baseRefName: target.nextBaseRefName,
    githubUpdatedAt: pullRequest.githubUpdatedAt,
    lastSyncedAt: now,
    updatedAt: now,
  }).where(and(
    eq(pullRequests.githubPullRequestId, target.childPullRequestId),
    lte(pullRequests.githubUpdatedAt, pullRequest.githubUpdatedAt),
  ))
  await db.update(autoRetargetEvents).set({
    status: 'succeeded',
    errorMessage: null,
  }).where(eq(autoRetargetEvents.id, target.attemptId))
}

async function finishSkipped(
  db: AutoRetargetDb,
  attemptId: number,
  reason: string,
): Promise<AutoRetargetStep> {
  await db.update(autoRetargetEvents).set({
    status: 'skipped',
    errorMessage: reason,
  }).where(eq(autoRetargetEvents.id, attemptId))
  return { kind: 'skipped' }
}

async function finishFailed(
  db: AutoRetargetDb,
  attemptId: number,
  message: string,
): Promise<{ kind: 'failed', message: string }> {
  const bounded = message.slice(0, MAX_ERROR_MESSAGE_LENGTH)
  await db.update(autoRetargetEvents).set({
    status: 'failed',
    errorMessage: bounded,
  }).where(eq(autoRetargetEvents.id, attemptId))
  return { kind: 'failed', message: bounded }
}

function repositoryAvailable(repository: {
  repositoryArchived: boolean
  githubInstallationId: string | null
  installationActive: boolean | null
  installationSuspendedAt: Date | null
}): boolean {
  return !repository.repositoryArchived
    && repository.githubInstallationId !== null
    && repository.installationActive === true
    && repository.installationSuspendedAt === null
}

function sameRepository(
  repositoryOwner: string,
  repositoryName: string,
  headRepositoryOwner: string | null,
  headRepositoryName: string | null,
): boolean {
  return headRepositoryOwner !== null
    && headRepositoryName !== null
    && repositoryOwner.toLowerCase() === headRepositoryOwner.toLowerCase()
    && repositoryName.toLowerCase() === headRepositoryName.toLowerCase()
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

import { mapWithConcurrency } from './concurrency'
import type { DashboardReconciliationStore } from './github'
import type { AuthorizedRepository, DashboardReconciler } from './types'

const STALE_THRESHOLD_MS = 7 * 60 * 1000
const MAX_REPOS_PER_RUN = 50
const INSTALLATION_CONCURRENCY = 4
const REPO_CONCURRENCY = 4

export interface BackgroundReconcileResult {
  reconciled: number
  skipped: number
  failed: number
}

export interface BackgroundReconcileWorker {
  runOnce(): Promise<BackgroundReconcileResult>
}

interface InstallationGroup {
  installationId: string
  repositories: AuthorizedRepository[]
}

/**
 * Background safety-net that reconciles stale repositories on the cron, without a
 * user session: it mints one GitHub App installation token per installation and
 * reuses the existing reconciler. Self-healing by construction: nothing here
 * throws out of `runOnce()`, and the reconciler's persist stamps
 * `dashboardReconciledAt`, so any repo that fails or is skipped simply reappears in
 * the next tick's stale-list. That invariant is why there is no retry bookkeeping.
 */
export function createBackgroundReconcileWorker(dependencies: {
  store: Pick<DashboardReconciliationStore, 'listStaleRepositories'>
  reconciler: DashboardReconciler
  mintToken: (installationId: string) => Promise<string>
  now?: () => Date
  logError?: (message: string, error?: unknown) => void
  staleThresholdMs?: number
  maxReposPerRun?: number
  installationConcurrency?: number
  repoConcurrency?: number
}): BackgroundReconcileWorker {
  const { store, reconciler, mintToken } = dependencies
  const now = dependencies.now ?? (() => new Date())
  const logError = dependencies.logError
    ?? ((message, error) => error === undefined ? console.error(message) : console.error(message, error))
  const staleThresholdMs = dependencies.staleThresholdMs ?? STALE_THRESHOLD_MS
  const maxReposPerRun = dependencies.maxReposPerRun ?? MAX_REPOS_PER_RUN
  const installationConcurrency = dependencies.installationConcurrency ?? INSTALLATION_CONCURRENCY
  const repoConcurrency = dependencies.repoConcurrency ?? REPO_CONCURRENCY

  return {
    async runOnce() {
      const staleBefore = new Date(now().getTime() - staleThresholdMs)
      // Fetch one past the cap purely to detect (cheaply) that more remain, so the
      // overflow can be logged without scanning the full stale set.
      const stale = await store.listStaleRepositories({
        staleBefore,
        limit: maxReposPerRun + 1,
      })
      const skipped = Math.max(0, stale.length - maxReposPerRun)
      if (skipped > 0) {
        logError(
          `background reconcile: more than ${maxReposPerRun} stale repositories; `
          + `deferring the oldest-first overflow to the next run`,
        )
      }
      const repositories = stale.slice(0, maxReposPerRun)

      const groupResults = await mapWithConcurrency(
        groupByInstallation(repositories),
        installationConcurrency,
        group => reconcileGroup(group),
      )

      return groupResults.reduce<BackgroundReconcileResult>(
        (totals, group) => ({
          reconciled: totals.reconciled + group.reconciled,
          skipped: totals.skipped,
          failed: totals.failed + group.failed,
        }),
        { reconciled: 0, skipped, failed: 0 },
      )
    },
  }

  // Mint once per installation, then reconcile its repositories concurrently. A
  // mint failure isolates to its group (the whole group is counted failed, no
  // throw); a per-repo failure isolates to that repo. Either way the rest proceed.
  async function reconcileGroup(
    group: InstallationGroup,
  ): Promise<{ reconciled: number, failed: number }> {
    let token: string
    try {
      token = await mintToken(group.installationId)
    }
    catch (error) {
      logError(
        `background reconcile: minting a token for installation ${group.installationId} failed; `
        + `skipping its ${group.repositories.length} repositories`,
        error,
      )
      return { reconciled: 0, failed: group.repositories.length }
    }

    const outcomes = await mapWithConcurrency(
      group.repositories,
      repoConcurrency,
      async (repository) => {
        try {
          await reconciler.reconcile(repository, { token }, now())
          return true
        }
        catch (error) {
          logError(
            `background reconcile failed for ${repository.owner}/${repository.name}`,
            error,
          )
          return false
        }
      },
    )
    const reconciled = outcomes.filter(Boolean).length
    return { reconciled, failed: outcomes.length - reconciled }
  }
}

/**
 * Groups repositories by their installation so each installation mints a single
 * token. Preserves the stale-list ordering of first appearance across groups.
 *
 * @param repositories - Stale repositories to group, each carrying an installation id.
 * @returns One group per installation, with its repositories in input order.
 */
function groupByInstallation(repositories: AuthorizedRepository[]): InstallationGroup[] {
  const byInstallation = new Map<string, AuthorizedRepository[]>()
  for (const repository of repositories) {
    const group = byInstallation.get(repository.githubInstallationId) ?? []
    group.push(repository)
    byInstallation.set(repository.githubInstallationId, group)
  }
  return [...byInstallation].map(([installationId, repos]) => ({
    installationId,
    repositories: repos,
  }))
}

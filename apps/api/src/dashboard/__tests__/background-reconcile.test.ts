import { describe, expect, it, vi } from 'vitest'
import { createBackgroundReconcileWorker } from '../background-reconcile'
import type { AuthorizedRepository, DashboardReconciler } from '../types'

const NOW = new Date('2026-06-24T12:00:00.000Z')

function repo(
  id: string,
  installationId: string,
  overrides: Partial<AuthorizedRepository> = {},
): AuthorizedRepository {
  return {
    githubRepositoryId: id,
    githubInstallationId: installationId,
    owner: 'acme',
    name: id,
    dashboardReconciledAt: null,
    ...overrides,
  }
}

function worker(options: {
  stale: AuthorizedRepository[]
  reconcileImpl?: DashboardReconciler['reconcile']
  mintTokenImpl?: (installationId: string) => Promise<string>
  logError?: (message: string, error?: unknown) => void
  maxReposPerRun?: number
}) {
  const listStaleRepositories = vi.fn(async () => options.stale)
  const reconcile = vi.fn(
    options.reconcileImpl
    ?? (async (_repository: AuthorizedRepository, _auth: { token: string }, _now: Date) => {}),
  )
  const mintToken = vi.fn(
    options.mintTokenImpl ?? (async (installationId: string) => `token-${installationId}`),
  )
  const created = createBackgroundReconcileWorker({
    store: { listStaleRepositories },
    reconciler: { reconcile },
    mintToken,
    now: () => NOW,
    logError: options.logError ?? (() => {}),
    ...(options.maxReposPerRun === undefined ? {} : { maxReposPerRun: options.maxReposPerRun }),
  })
  return { created, listStaleRepositories, reconcile, mintToken }
}

describe('background reconcile worker', () => {
  it('queries the stale-list with the configured threshold and limit', async () => {
    const { created, listStaleRepositories } = worker({
      stale: [],
      maxReposPerRun: 50,
    })

    await created.runOnce()

    expect(listStaleRepositories).toHaveBeenCalledWith({
      staleBefore: new Date(NOW.getTime() - 7 * 60 * 1000),
      limit: 51,
    })
  })

  it('mints one token per installation and reconciles each repo with it', async () => {
    const { created, reconcile, mintToken } = worker({
      stale: [
        repo('R_a1', 'I_one'),
        repo('R_a2', 'I_one'),
        repo('R_b1', 'I_two'),
      ],
    })

    const result = await created.runOnce()

    expect(result).toEqual({ reconciled: 3, skipped: 0, failed: 0 })
    expect(mintToken).toHaveBeenCalledTimes(2)
    expect(mintToken.mock.calls.map(call => call[0]).sort()).toEqual(['I_one', 'I_two'])
    const tokensByRepo = new Map(
      reconcile.mock.calls.map(call => [call[0].githubRepositoryId, call[1].token]),
    )
    expect(tokensByRepo.get('R_a1')).toBe('token-I_one')
    expect(tokensByRepo.get('R_a2')).toBe('token-I_one')
    expect(tokensByRepo.get('R_b1')).toBe('token-I_two')
  })

  it('isolates a per-repo reconcile failure and keeps going', async () => {
    const { created, reconcile } = worker({
      stale: [repo('R_ok1', 'I_one'), repo('R_bad', 'I_one'), repo('R_ok2', 'I_one')],
      reconcileImpl: async (repository) => {
        if (repository.githubRepositoryId === 'R_bad') throw new Error('boom')
      },
    })

    const result = await created.runOnce()

    expect(result).toEqual({ reconciled: 2, skipped: 0, failed: 1 })
    expect(reconcile).toHaveBeenCalledTimes(3)
  })

  it('isolates a per-installation token-mint failure and reconciles the rest', async () => {
    const { created, reconcile } = worker({
      stale: [
        repo('R_bad1', 'I_bad'),
        repo('R_bad2', 'I_bad'),
        repo('R_good', 'I_good'),
      ],
      mintTokenImpl: async (installationId) => {
        if (installationId === 'I_bad') throw new Error('suspended')
        return `token-${installationId}`
      },
    })

    const result = await created.runOnce()

    expect(result).toEqual({ reconciled: 1, skipped: 0, failed: 2 })
    expect(reconcile).toHaveBeenCalledTimes(1)
    expect(reconcile.mock.calls.map(call => call[0].githubRepositoryId)).toEqual(['R_good'])
  })

  it('processes only the cap and reports the deferred overflow', async () => {
    const logError = vi.fn()
    // listStaleRepositories is asked for maxReposPerRun + 1; returning that many
    // signals overflow.
    const stale = Array.from({ length: 4 }, (_, index) => repo(`R_${index}`, 'I_one'))
    const { created, reconcile } = worker({ stale, logError, maxReposPerRun: 3 })

    const result = await created.runOnce()

    expect(result).toEqual({ reconciled: 3, skipped: 1, failed: 0 })
    expect(reconcile).toHaveBeenCalledTimes(3)
    expect(logError).toHaveBeenCalledOnce()
  })
})

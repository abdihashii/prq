import { describe, expect, it, vi } from 'vitest'
import {
  AutoRetargetError,
  createAutoRetargetService,
  createAutoRetargetWorker,
} from '../auto-retarget'
import type {
  AutoRetargetService,
  AutoRetargetStep,
  AutoRetargetStore,
  GitHubRetargetClient,
} from '../auto-retarget/types'

const NOW = new Date('2026-06-09T12:00:00.000Z')
const ARGS = {
  deliveryId: 'delivery-1',
  parentPullRequestId: 'PR_parent',
  desiredBaseRefName: 'main',
}

describe('auto-retarget service', () => {
  it('hides the phase machine behind one successful operation', async () => {
    const store = fakeStore([
      { kind: 'continue', attemptId: 7 },
      { kind: 'continue', attemptId: 7 },
      { kind: 'succeeded' },
    ])
    const github = fakeGitHub()
    const service = createAutoRetargetService({ store, github, now: () => NOW })

    await expect(service.retargetMergedParent(ARGS)).resolves.toBe('succeeded')

    expect(store.prepare).toHaveBeenCalledWith(ARGS, NOW)
    expect(store.validate).toHaveBeenCalledWith(7, github.inspect, NOW)
    expect(store.apply).toHaveBeenCalledWith(7, github.inspect, github.retarget, NOW)
  })

  it('returns terminal prepare and validation outcomes without later phases', async () => {
    for (const scenario of [
      {
        expected: 'already-complete' as const,
        steps: [{ kind: 'already-complete' as const }],
      },
      {
        expected: 'skipped' as const,
        steps: [{ kind: 'continue' as const, attemptId: 1 }, { kind: 'skipped' as const }],
      },
    ]) {
      const store = fakeStore(scenario.steps)
      const service = createAutoRetargetService({ store, github: fakeGitHub() })

      await expect(service.retargetMergedParent(ARGS))
        .resolves.toBe(scenario.expected)
      expect(store.apply).not.toHaveBeenCalled()
    }
  })

  it('throws recorded failures while durable work remains retryable', async () => {
    const store = fakeStore([
      { kind: 'continue', attemptId: 1 },
      { kind: 'failed', message: 'GitHub unavailable' },
    ])
    const service = createAutoRetargetService({ store, github: fakeGitHub() })

    await expect(service.retargetMergedParent(ARGS))
      .rejects.toEqual(new AutoRetargetError('GitHub unavailable'))
  })

  it('drains durable work and isolates individual failures', async () => {
    const store = fakeStore([])
    vi.mocked(store.loadWork).mockResolvedValue([
      ARGS,
      { ...ARGS, parentPullRequestId: 'PR_other' },
    ])
    const service: AutoRetargetService = {
      retargetMergedParent: vi.fn()
        .mockRejectedValueOnce(new Error('temporary failure'))
        .mockResolvedValueOnce('succeeded'),
    }
    const logError = vi.fn()
    const worker = createAutoRetargetWorker({ store, service, logError })

    await expect(worker.runOnce()).resolves.toBe(2)

    expect(service.retargetMergedParent).toHaveBeenCalledTimes(2)
    expect(logError).toHaveBeenCalledOnce()
  })
})

function fakeStore(steps: AutoRetargetStep[]): AutoRetargetStore {
  const next = (): AutoRetargetStep => steps.shift() ?? { kind: 'already-complete' }
  return {
    loadWork: vi.fn(async () => []),
    prepare: vi.fn(async () => next()),
    validate: vi.fn(async () => next()),
    apply: vi.fn(async () => next()),
  }
}

function fakeGitHub(): GitHubRetargetClient {
  return {
    inspect: vi.fn(),
    retarget: vi.fn(),
  }
}

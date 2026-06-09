import { createGitHubRetargetClient } from './auto-retarget/github'
import { createDrizzleAutoRetargetStore } from './auto-retarget/store'
import type {
  AutoRetargetService,
  AutoRetargetStore,
  GitHubRetargetClient,
} from './auto-retarget/types'

export type {
  AutoRetargetResult,
  AutoRetargetService,
  MergedParentRetarget,
} from './auto-retarget/types'

export class AutoRetargetError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AutoRetargetError'
  }
}

export function createAutoRetargetService(dependencies: {
  store?: AutoRetargetStore
  github?: GitHubRetargetClient
  now?: () => Date
} = {}): AutoRetargetService {
  const store = dependencies.store ?? createDrizzleAutoRetargetStore()
  const github = dependencies.github ?? createGitHubRetargetClient()
  const now = dependencies.now ?? (() => new Date())

  return {
    async retargetMergedParent(args) {
      const prepared = await store.prepare(args, now())
      if (prepared.kind !== 'continue') return finish(prepared)

      const validated = await store.validate(prepared.attemptId, github.inspect, now())
      if (validated.kind !== 'continue') return finish(validated)

      return finish(await store.apply(
        validated.attemptId,
        github.inspect,
        github.retarget,
        now(),
      ))
    },
  }
}

function finish(step: Awaited<ReturnType<AutoRetargetStore['prepare']>>) {
  if (step.kind === 'failed') throw new AutoRetargetError(step.message)
  if (step.kind === 'continue') throw new AutoRetargetError('Auto-retarget attempt did not finish')
  return step.kind
}

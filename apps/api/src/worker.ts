import type { ExecutionContext } from 'hono'
import { createApp } from './app'
import { assertCronConfig, isProductionEnv, resolveRequestConfig, type RequestConfig } from './config'
import {
  createAutoRetargetCronWorker,
  createBackgroundReconcileCronWorker,
  createWorkerDb,
  type WorkerBindings,
} from './request-context'

const app = createApp()

export default {
  fetch(request: Request, env: WorkerBindings, ctx: ExecutionContext) {
    return app.fetch(request, env, ctx)
  },

  // Cron Trigger: setInterval doesn't run in Workers, so each scheduled invocation
  // runs one pass of the cron fallbacks (auto-retarget and the background dashboard
  // reconcile; see triggers.crons in wrangler.jsonc).
  async scheduled(_event: unknown, env: WorkerBindings, _ctx: ExecutionContext) {
    const { HYPERDRIVE: _hyperdrive, ...vars } = env

    // The /api/* fetch path gates on config and 500s loudly; the cron path had no
    // gate, so a missing secret made runOnce() a silent no-op (it swallows per-item
    // errors). Resolve and validate up front (assertCronConfig checks only the App
    // mutation creds the cron uses, not the unrelated OAuth/webhook secrets) and throw
    // so any config error fails the invocation visibly in Cloudflare metrics. The error
    // names only the missing vars, never their values, so logging it leaks nothing.
    let config: RequestConfig
    try {
      config = resolveRequestConfig(vars)
      assertCronConfig(config, { production: isProductionEnv(vars) })
    }
    catch (error) {
      console.error('cron: invalid or missing config', error)
      throw error
    }

    const client = createWorkerDb(env)
    try {
      // Run both fallbacks on the one DB client. allSettled so a failure in one does
      // not mask or abort the other; re-throw afterwards so any failure still fails
      // the invocation visibly in Cloudflare metrics.
      const outcomes = await Promise.allSettled([
        createAutoRetargetCronWorker({
          mutationConfig: config.mutationConfig,
          db: client.db,
        }).runOnce(),
        createBackgroundReconcileCronWorker({
          mutationConfig: config.mutationConfig,
          db: client.db,
        }).runOnce(),
      ])
      // Log the background reconcile counts: a 5-min cron that is silent on success
      // is hard to operate, and these counts confirm a run actually did work.
      const [, backgroundReconcile] = outcomes
      if (backgroundReconcile.status === 'fulfilled') {
        console.log('background reconcile complete', backgroundReconcile.value)
      }
      const failures = outcomes.filter(
        (outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected',
      )
      for (const failure of failures) {
        console.error('cron task failed', failure.reason)
      }
      const [firstFailure] = failures
      if (firstFailure) throw firstFailure.reason
    }
    finally {
      await client.close()
    }
  },
}

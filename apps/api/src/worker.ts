import type { ExecutionContext } from 'hono'
import { createApp } from './app'
import { assertCronConfig, isProductionEnv, resolveRequestConfig, type RequestConfig } from './config'
import {
  createAutoRetargetCronWorker,
  createWorkerDb,
  type WorkerBindings,
} from './request-context'

const app = createApp()

export default {
  fetch(request: Request, env: WorkerBindings, ctx: ExecutionContext) {
    return app.fetch(request, env, ctx)
  },

  // Cron Trigger: setInterval doesn't run in Workers, so the auto-retarget fallback
  // runs one pass per scheduled invocation (see triggers.crons in wrangler.jsonc).
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
      console.error('auto-retarget cron: invalid or missing config', error)
      throw error
    }

    const client = createWorkerDb(env)
    try {
      await createAutoRetargetCronWorker({
        mutationConfig: config.mutationConfig,
        db: client.db,
      }).runOnce()
    }
    finally {
      await client.close()
    }
  },
}

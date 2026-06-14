import type { ExecutionContext } from 'hono'
import { createApp } from './app'
import { assertRequiredConfig, isProductionEnv, resolveRequestConfig } from './config'
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
    const config = resolveRequestConfig(vars)

    // The /api/* fetch path gates on config and 500s loudly; the cron path had no
    // gate, so a missing secret made runOnce() a silent no-op (it swallows per-item
    // errors). Validate up front and throw so a missing secret fails the invocation
    // visibly in Cloudflare metrics. The error names only the missing vars, never
    // their values, so logging it leaks nothing.
    try {
      assertRequiredConfig(config, { production: isProductionEnv(vars) })
    }
    catch (error) {
      console.error('auto-retarget cron: required config missing', error)
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

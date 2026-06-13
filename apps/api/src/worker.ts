import type { ExecutionContext } from 'hono'
import { createApp } from './app'
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
    const client = createWorkerDb(env)
    const { HYPERDRIVE: _hyperdrive, ...vars } = env
    try {
      await createAutoRetargetCronWorker({ env: vars, db: client.db }).runOnce()
    }
    finally {
      await client.close()
    }
  },
}

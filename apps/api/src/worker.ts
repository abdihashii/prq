import type { ExecutionContext } from 'hono'
import { createApp } from './app'
import type { WorkerBindings } from './request-context'

const app = createApp()

export default {
  fetch(request: Request, env: WorkerBindings, ctx: ExecutionContext) {
    return app.fetch(request, env, ctx)
  },
}

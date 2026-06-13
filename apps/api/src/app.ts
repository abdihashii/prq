import { Hono } from 'hono'
import { env, getRuntimeKey } from 'hono/adapter'
import { csrf } from 'hono/csrf'
import { assertRequiredConfig, isProductionEnv, resolveRequestConfig } from './config'
import { createDatabase, getDatabase } from './db'
import { type AppEnv, createRequestContext } from './request-context'
import { auth } from './routes/auth'
import { prs } from './routes/prs'
import { user } from './routes/user'
import { webhooks } from './routes/webhooks'

// Workers cap concurrent external connections; Hyperdrive pools upstream, so the
// per-isolate client stays small.
const WORKER_MAX_CONNECTIONS = 5

/**
 * Build the Hono app shared by the Node server and the Cloudflare Worker. One
 * middleware resolves the per-request context (config + DB) from the environment and
 * owns the DB lifecycle: a per-request Hyperdrive client on Workers, closed after the
 * response; the long-lived singleton on Node.
 */
export function createApp() {
  const app = new Hono<AppEnv>()

  app.get('/health', c => c.json({ ok: true }))

  app.use('/api/*', csrf())
  app.use('/api/*', async (c, next) => {
    const configEnv = env<Record<string, string | undefined>>(c)

    if (getRuntimeKey() === 'workerd') {
      // Node fails this at startup; the Worker has no startup, so validate per
      // request (only /api/* — /health stays up as a liveness probe).
      assertRequiredConfig(resolveRequestConfig(configEnv), {
        production: isProductionEnv(configEnv),
      })
      const client = createDatabase(
        {
          url: c.env.HYPERDRIVE.connectionString,
          ssl: false,
          maxConnections: WORKER_MAX_CONNECTIONS,
        },
        { fetchTypes: false },
      )
      c.set('ctx', createRequestContext({ env: configEnv, db: client.db }))
      try {
        await next()
      }
      finally {
        c.executionCtx.waitUntil(client.close())
      }
      return
    }

    c.set('ctx', createRequestContext({ env: configEnv, db: getDatabase().db }))
    await next()
  })

  app.route('/api', prs)
  app.route('/api', auth)
  app.route('/api', user)
  app.route('/api', webhooks)

  return app
}

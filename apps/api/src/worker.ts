import { Hono } from 'hono'
import { csrf } from 'hono/csrf'
import { prs } from './routes/prs'
import { auth } from './routes/auth'
import { user } from './routes/user'
import { webhooks } from './routes/webhooks'

export interface Env {
  HYPERDRIVE: { connectionString: string }
  PRQ_GITHUB_CLIENT_ID: string
  PRQ_GITHUB_CLIENT_SECRET: string
  PRQ_GITHUB_PRIVATE_KEY: string
  PRQ_GITHUB_WEBHOOK_SECRET: string
  PRQ_GITHUB_CALLBACK_URL?: string
  PRQ_WEB_URL?: string
  PRQ_GITHUB_APP_SLUG?: string
}

const app = new Hono()
app.use('/api/*', csrf())
app.get('/health', c => c.json({ ok: true }))
app.route('/api', prs)
app.route('/api', auth)
app.route('/api', user)
app.route('/api', webhooks)

export default {
  async fetch(request: Request, env: Env) {
    process.env.DATABASE_URL = env.HYPERDRIVE.connectionString
    return await app.fetch(request)
  },
}

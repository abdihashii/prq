import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { csrf } from 'hono/csrf'
import { githubClientId } from './config'
import { auth } from './routes/auth'
import { prs } from './routes/prs'
import { user } from './routes/user'

if (!githubClientId) {
  console.error(
    'PRQ_GITHUB_CLIENT_ID is not set. Register an OAuth App at '
    + 'https://github.com/settings/applications/new (enable Device Flow + '
    + 'token expiration), then set the Client ID in apps/api/.env.',
  )
  process.exit(1)
}

const app = new Hono()
app.use('/api/*', csrf())
app.get('/health', c => c.json({ ok: true }))
app.route('/api', prs)
app.route('/api', auth)
app.route('/api', user)

serve({ fetch: app.fetch, port: 3001 }, ({ port }) => {
  console.log(`prq api listening on :${port}`)
})

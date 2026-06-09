import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { csrf } from 'hono/csrf'
import {
  githubAppAuthConfig,
  githubAppMutationConfig,
  githubWebhookSecret,
  missingGitHubAppAuthConfig,
  missingGitHubAppMutationConfig,
} from './config'
import { auth } from './routes/auth'
import { prs } from './routes/prs'
import { user } from './routes/user'
import { webhooks } from './routes/webhooks'

if (!githubAppAuthConfig.clientId) {
  console.error(
    'PRQ_GITHUB_CLIENT_ID is not set. Register a GitHub App at '
    + 'https://github.com/settings/apps/new, then set its Client ID in apps/api/.env.',
  )
  process.exit(1)
}

const missingGitHubAppConfig = missingGitHubAppAuthConfig(githubAppAuthConfig)
if (process.env['NODE_ENV'] === 'production' && missingGitHubAppConfig.length > 0) {
  console.error(
    `GitHub App auth is missing required production config: ${missingGitHubAppConfig.join(', ')}`,
  )
  process.exit(1)
}
if (process.env['NODE_ENV'] === 'production' && !githubWebhookSecret) {
  console.error('GitHub App webhooks are missing required production config: PRQ_GITHUB_WEBHOOK_SECRET')
  process.exit(1)
}
const missingGitHubMutationConfig = missingGitHubAppMutationConfig(githubAppMutationConfig)
if (process.env['NODE_ENV'] === 'production' && missingGitHubMutationConfig.length > 0) {
  console.error(
    `GitHub App mutations are missing required production config: ${missingGitHubMutationConfig.join(', ')}`,
  )
  process.exit(1)
}

const app = new Hono()
app.use('/api/*', csrf())
app.get('/health', c => c.json({ ok: true }))
app.route('/api', prs)
app.route('/api', auth)
app.route('/api', user)
app.route('/api', webhooks)

serve({ fetch: app.fetch, port: 3001 }, ({ port }) => {
  console.log(`prq api listening on :${port}`)
})

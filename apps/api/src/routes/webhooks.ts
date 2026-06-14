import { type Context, Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { ingestGitHubWebhook } from '../github/webhook'
import type { AppEnv } from '../request-context'

const GITHUB_WEBHOOK_BODY_LIMIT_BYTES = 25 * 1024 * 1024

export const webhooks = new Hono<AppEnv>()

webhooks.post(
  '/webhooks/github',
  bodyLimit({ maxSize: GITHUB_WEBHOOK_BODY_LIMIT_BYTES }),
  async (c) => {
    try {
      await ingestGitHubWebhook(c.req.raw, c.var.ctx.webhookDeps)
      return c.body(null, 204)
    }
    catch (error) {
      return mapWebhookError(c, error)
    }
  },
)

function mapWebhookError(c: Context<AppEnv>, error: unknown) {
  const status = errorStatus(error)
  if (status === 400) {
    return c.json({ error: { code: 'BAD_REQUEST', message: errorMessage(error) } }, 400)
  }
  if (status === 401) {
    return c.json({ error: { code: 'BAD_SIGNATURE', message: 'Invalid webhook signature' } }, 401)
  }

  console.error('github webhook handler error:', error)
  return c.json(
    { error: { code: 'INTERNAL_ERROR', message: 'Failed to ingest GitHub webhook' } },
    500,
  )
}

function errorStatus(error: unknown): unknown {
  return error && typeof error === 'object' && 'status' in error ? error.status : undefined
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Malformed GitHub webhook'
}

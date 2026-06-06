import { type Context, Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { DeviceFlowPollRequestSchema } from '@prq/shared'
import {
  beginGitHubAppSignIn,
  clearCurrentAuthSession,
  completeGitHubAppCallback,
  completeGitHubAppSetup,
  GitHubAppAuthConfigError,
  GitHubAppAuthFlowError,
  redirectToGitHubAppAuthError,
  redirectToGitHubAppInstall,
} from '../auth/session'
import { githubClientId } from '../config'
import { pollDeviceCode, startDeviceCode } from '../github/device-flow'
import { getViewer } from '../github/get-viewer'
import { setSessionCookie } from '../middleware/with-auth'

export const auth = new Hono()

const POLL_BODY_LIMIT_BYTES = 1024

auth.get('/auth/github/start', (c) => {
  try {
    return beginGitHubAppSignIn(c)
  }
  catch (err) {
    return mapGitHubAppStartError(c, err)
  }
})

auth.get('/auth/github/callback', async (c) => {
  try {
    return await completeGitHubAppCallback(c)
  }
  catch (err) {
    return mapGitHubAppCallbackError(c, err)
  }
})

auth.get('/auth/github/install', (c) => {
  try {
    return redirectToGitHubAppInstall(c)
  }
  catch (err) {
    return mapGitHubAppStartError(c, err)
  }
})

auth.get('/auth/github/setup', async (c) => {
  try {
    return await completeGitHubAppSetup(c)
  }
  catch (err) {
    return mapGitHubAppCallbackError(c, err)
  }
})

auth.post('/auth/device/start', async (c) => {
  try {
    const result = await startDeviceCode(githubClientId)
    return c.json(result)
  }
  catch (err) {
    console.error('device/start handler error:', err)
    return c.json(
      { error: { code: 'UPSTREAM_ERROR', message: 'Failed to start GitHub sign-in' } },
      502,
    )
  }
})

auth.post(
  '/auth/device/poll',
  bodyLimit({ maxSize: POLL_BODY_LIMIT_BYTES }),
  async (c) => {
    let raw: unknown
    try {
      raw = await c.req.json()
    }
    catch {
      return badRequest(c, 'Request body must be JSON')
    }
    const parsed = DeviceFlowPollRequestSchema.safeParse(raw)
    if (!parsed.success) {
      return badRequest(c, 'Request body must be { deviceCode: string }')
    }

    try {
      const result = await pollDeviceCode(githubClientId, parsed.data.deviceCode)
      switch (result.kind) {
        case 'pending':
          return c.json({ status: 'pending' as const })
        case 'slow_down':
          return c.json({ status: 'slow_down' as const, interval: result.interval })
        case 'expired':
          return c.json({ status: 'expired' as const })
        case 'denied':
          return c.json({ status: 'denied' as const })
        case 'success': {
          setSessionCookie(c, result.accessToken)
          const { login } = await getViewer(result.accessToken)
          return c.json({ status: 'success' as const, login })
        }
      }
    }
    catch (err) {
      console.error('device/poll handler error:', err)
      return c.json(
        { error: { code: 'UPSTREAM_ERROR', message: 'Failed to reach GitHub' } },
        502,
      )
    }
  },
)

auth.delete('/auth/session', async (c) => {
  await clearCurrentAuthSession(c)
  return c.body(null, 204)
})

function badRequest(c: Context, message: string) {
  return c.json({ error: { code: 'BAD_REQUEST', message } }, 400)
}

function mapGitHubAppStartError(c: Context, err: unknown) {
  if (err instanceof GitHubAppAuthConfigError) {
    return c.json(
      { error: { code: 'UPSTREAM_ERROR', message: err.message } },
      500,
    )
  }

  console.error('github app auth start handler error:', err)
  return c.json(
    { error: { code: 'UPSTREAM_ERROR', message: 'Failed to start GitHub App sign-in' } },
    502,
  )
}

function mapGitHubAppCallbackError(c: Context, err: unknown) {
  if (err instanceof GitHubAppAuthFlowError) {
    return redirectToGitHubAppAuthError(c, err.code)
  }
  if (err instanceof GitHubAppAuthConfigError) {
    console.error('github app auth config error:', err)
    return redirectToGitHubAppAuthError(c, 'github_app_not_configured')
  }

  console.error('github app auth callback handler error:', err)
  return redirectToGitHubAppAuthError(c, 'github_auth_failed')
}

import { type Context, Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { DeviceFlowPollRequestSchema } from '@prq/shared'
import { githubClientId } from '../config'
import { pollDeviceCode, startDeviceCode } from '../github/device-flow'
import { getViewer } from '../github/get-viewer'
import { clearSessionCookie, setSessionCookie } from '../middleware/with-auth'

export const auth = new Hono()

const POLL_BODY_LIMIT_BYTES = 1024

auth.post('/auth/device/start', async (c) => {
  try {
    const result = await startDeviceCode(githubClientId)
    return c.json(result)
  }
  catch {
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
    catch {
      return c.json(
        { error: { code: 'UPSTREAM_ERROR', message: 'Failed to reach GitHub' } },
        502,
      )
    }
  },
)

auth.delete('/auth/session', (c) => {
  clearSessionCookie(c)
  return c.body(null, 204)
})

function badRequest(c: Context, message: string) {
  return c.json({ error: { code: 'BAD_REQUEST', message } }, 400)
}

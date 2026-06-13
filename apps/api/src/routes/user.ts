import { type Context, Hono } from 'hono'
import { getAuthenticatedViewer, UnauthorizedError } from '../auth/session'
import type { AppEnv } from '../request-context'

export const user = new Hono<AppEnv>()

user.get('/user', async (c) => {
  try {
    const { login } = await getAuthenticatedViewer(c, c.var.ctx.authDeps)
    return c.json({ login })
  }
  catch (err) {
    return mapError(c, err)
  }
})

function mapError(c: Context<AppEnv>, err: unknown) {
  if (err instanceof UnauthorizedError) {
    return c.json(
      { error: { code: 'BAD_CREDENTIALS', message: 'Not signed in' } },
      401,
    )
  }
  console.error('user handler error:', err)
  return c.json(
    { error: { code: 'UPSTREAM_ERROR', message: 'Failed to load user' } },
    500,
  )
}

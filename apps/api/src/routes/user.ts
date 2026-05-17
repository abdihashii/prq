import { type Context, Hono } from 'hono'
import { getViewer } from '../github/get-viewer'
import { UnauthorizedError, withAuth } from '../middleware/with-auth'

export const user = new Hono()

user.get('/user', async (c) => {
  try {
    const { login } = await withAuth(c, token => getViewer(token))
    return c.json({ login })
  }
  catch (err) {
    return mapError(c, err)
  }
})

function mapError(c: Context, err: unknown) {
  if (err instanceof UnauthorizedError) {
    return c.json(
      { error: { code: 'BAD_CREDENTIALS', message: 'Not signed in' } },
      401,
    )
  }
  if (err && typeof err === 'object' && 'status' in err && err.status === 401) {
    return c.json(
      { error: { code: 'BAD_CREDENTIALS', message: 'GitHub rejected the session' } },
      401,
    )
  }
  return c.json(
    { error: { code: 'UPSTREAM_ERROR', message: 'Failed to reach GitHub' } },
    502,
  )
}

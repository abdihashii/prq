import { type Context, Hono } from 'hono'
import { getCookie } from 'hono/cookie'
import { getViewer } from '../github/get-viewer'

export const user = new Hono()

user.get('/user', async (c) => {
  const pat = getCookie(c, 'prq_pat')
  if (!pat) {
    return c.json(
      { error: { code: 'BAD_CREDENTIALS', message: 'No GitHub PAT set' } },
      401,
    )
  }

  try {
    const { login } = await getViewer(pat)
    return c.json({ login })
  } catch (err) {
    return mapGithubError(c, err)
  }
})

function mapGithubError(c: Context, err: unknown) {
  if (err && typeof err === 'object' && 'status' in err && err.status === 401) {
    return c.json(
      { error: { code: 'BAD_CREDENTIALS', message: 'GitHub rejected the token' } },
      401,
    )
  }
  return c.json(
    { error: { code: 'UPSTREAM_ERROR', message: 'Failed to reach GitHub' } },
    502,
  )
}

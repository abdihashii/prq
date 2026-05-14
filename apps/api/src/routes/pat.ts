import { type Context, Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { deleteCookie, setCookie } from 'hono/cookie'
import { PatSubmitSchema } from '@prq/shared'
import { getViewer } from '../github/get-viewer'

export const pat = new Hono()

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 400
const PAT_BODY_LIMIT_BYTES = 1024

pat.post('/pat', bodyLimit({ maxSize: PAT_BODY_LIMIT_BYTES }), async (c) => {
  let raw: unknown
  try {
    raw = await c.req.json()
  } catch {
    return badRequest(c, 'Request body must be JSON')
  }

  const parsed = PatSubmitSchema.safeParse(raw)
  if (!parsed.success) {
    return badRequest(c, 'Request body must be { pat: string }')
  }

  try {
    const { login } = await getViewer(parsed.data.pat)
    setCookie(c, 'prq_pat', parsed.data.pat, {
      httpOnly: true,
      sameSite: 'Strict',
      path: '/api',
      maxAge: COOKIE_MAX_AGE_SECONDS,
      secure: process.env['NODE_ENV'] === 'production',
    })
    return c.json({ login })
  } catch (err) {
    return mapGithubError(c, err)
  }
})

pat.delete('/pat', (c) => {
  deleteCookie(c, 'prq_pat', { path: '/api' })
  return c.body(null, 204)
})

function badRequest(c: Context, message: string) {
  return c.json({ error: { code: 'BAD_REQUEST', message } }, 400)
}

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

import { type Context, Hono } from 'hono'
import { parseRepoList } from '@prq/shared'
import {
  clearCurrentAuthSession,
  getAuthenticatedPrincipal,
  UnauthorizedError,
} from '../auth/session'
import { createDashboardFacade } from '../dashboard/dashboard'
import {
  DashboardBadCredentialsError,
  DashboardRateLimitedError,
  DashboardUpstreamError,
} from '../dashboard/errors'

export const prs = new Hono()
const dashboard = createDashboardFacade()

prs.get('/prs', async (c) => {
  try {
    // @hono/node-server leaves %2F (slash) in query values un-decoded, while
    // app.request() in tests decodes automatically — normalize via
    // decodeURIComponent so both paths converge. Fall back to the raw value
    // when the input contains a malformed `%` escape (decodeURIComponent
    // throws URIError on those); parseRepoList's regex rejects it anyway,
    // so the filter degrades to an empty allowSet instead of a 502.
    const reposParam = c.req.query('repos')
    let normalized: string | undefined = reposParam
    try {
      if (reposParam !== undefined) normalized = decodeURIComponent(reposParam)
    }
    catch {
      normalized = reposParam
    }
    const allowSet = new Set(parseRepoList(normalized))

    const principal = await getAuthenticatedPrincipal(c)
    const body = await dashboard.getDashboard({
      principal,
      repositoryAllowlist: allowSet,
    })
    return c.json(body)
  } catch (err) {
    return await mapError(c, err)
  }
})

async function mapError(c: Context, err: unknown) {
  if (err instanceof DashboardBadCredentialsError) {
    await clearCurrentAuthSession(c)
    return c.json(
      { error: { code: 'BAD_CREDENTIALS', message: 'Not signed in' } },
      401,
    )
  }
  if (err instanceof UnauthorizedError) {
    return c.json(
      { error: { code: 'BAD_CREDENTIALS', message: 'Not signed in' } },
      401,
    )
  }
  if (err instanceof DashboardRateLimitedError) {
    return c.json(
      { error: { code: 'RATE_LIMITED', message: 'GitHub rate limit exceeded' } },
      429,
    )
  }
  if (err instanceof DashboardUpstreamError) {
    return c.json(
      { error: { code: 'UPSTREAM_ERROR', message: 'Failed to load dashboard' } },
      502,
    )
  }
  console.error('prs handler error:', err)
  return c.json(
    { error: { code: 'UPSTREAM_ERROR', message: 'Failed to load dashboard' } },
    502,
  )
}

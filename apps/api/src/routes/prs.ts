import { type Context, Hono } from 'hono'
import { parseRepoList } from '@prq/shared'
import { getAuthenticatedViewer, UnauthorizedError } from '../auth/session'
import { createDashboardService } from '../dashboard/dashboard'

export const prs = new Hono()
const dashboard = createDashboardService()

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

    const viewer = await getAuthenticatedViewer(c)
    const body = await dashboard.getDashboard({
      viewer,
      repositoryAllowlist: allowSet,
    })
    return c.json(body)
  } catch (err) {
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
  console.error('prs handler error:', err)
  return c.json(
    { error: { code: 'UPSTREAM_ERROR', message: 'Failed to load dashboard' } },
    500,
  )
}

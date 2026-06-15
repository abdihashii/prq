import { type Context, Hono } from 'hono'
import { parseRepoList } from '@prq/shared'
import {
  clearCurrentAuthSession,
  getAuthenticatedPrincipal,
  UnauthorizedError,
} from '../auth/session'
import {
  DashboardBadCredentialsError,
  DashboardRateLimitedError,
  DashboardUpstreamError,
} from '../dashboard/errors'
import type { AppEnv } from '../request-context'

export const prs = new Hono<AppEnv>()

prs.get('/prs', async (c) => {
  try {
    // An absent `repos` param means "no filter": track every repo in install
    // scope (All mode). A present param (even empty) filters to that set
    // (Custom mode). This keeps All mode representable without the client
    // first knowing the repo universe.
    //
    // @hono/node-server leaves %2F (slash) in query values un-decoded, while
    // app.request() in tests decodes automatically — normalize via
    // decodeURIComponent so both paths converge. Fall back to the raw value
    // when the input contains a malformed `%` escape (decodeURIComponent
    // throws URIError on those); parseRepoList's regex rejects it anyway,
    // so the filter degrades to an empty allowlist instead of a 502.
    const reposParam = c.req.query('repos')
    let repositoryAllowlist: ReadonlySet<string> | null = null
    if (reposParam !== undefined) {
      let normalized = reposParam
      try {
        normalized = decodeURIComponent(reposParam)
      }
      catch {
        normalized = reposParam
      }
      repositoryAllowlist = new Set(parseRepoList(normalized))
    }

    const principal = await getAuthenticatedPrincipal(c, c.var.ctx.authDeps)
    const body = await c.var.ctx.dashboard.getDashboard({
      principal,
      repositoryAllowlist,
    })
    return c.json(body)
  } catch (err) {
    return await mapError(c, err)
  }
})

async function mapError(c: Context<AppEnv>, err: unknown) {
  if (err instanceof DashboardBadCredentialsError) {
    await clearCurrentAuthSession(c, c.var.ctx.authDeps)
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

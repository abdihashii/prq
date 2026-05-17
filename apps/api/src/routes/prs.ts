import { GraphqlResponseError } from '@octokit/graphql'
import { type Context, Hono } from 'hono'
import {
  type Bucket,
  BucketedResponseSchema,
  mergeTrackableRepos,
  parseRepoList,
  type PullRequest,
} from '@prq/shared'
import { fetchPullRequests } from '../github/client'
import { RawResponseSchema } from '../github/schema'
import { transform } from '../github/transform'
import { UnauthorizedError, withAuth } from '../middleware/with-auth'

export const prs = new Hono()

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

    const raw = await withAuth(c, token => fetchPullRequests(token))
    const validated = RawResponseSchema.parse(raw)
    const { viewerLogin, rateLimit, pullRequests, ownedRepos } = transform(validated)

    const trackableRepos = mergeTrackableRepos(ownedRepos, pullRequests)
    const filtered = pullRequests.filter(pr =>
      allowSet.has(`${pr.repository.owner}/${pr.repository.name}`),
    )

    const buckets: Record<Bucket, PullRequest[]> = {
      review: [],
      attention: [],
      ready: [],
      waiting: [],
      drafts: [],
    }
    for (const pr of filtered) buckets[pr.bucket].push(pr)

    const body = BucketedResponseSchema.parse({
      viewerLogin,
      buckets,
      syncedAt: new Date().toISOString(),
      rateLimit,
      trackableRepos,
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
  if (err instanceof GraphqlResponseError) {
    const errors = (err.errors ?? []) as Array<{ type?: string }>
    const isRateLimited = errors.some((e) => e.type === 'RATE_LIMITED')
    if (isRateLimited) {
      const headers = (err.headers ?? {}) as Record<string, string | undefined>
      const reset = headers['x-ratelimit-reset']
      const resetAt = reset ? new Date(Number(reset) * 1000).toISOString() : undefined
      return c.json(
        { error: { code: 'RATE_LIMITED', message: 'GitHub API rate limit reached', resetAt } },
        429,
      )
    }
    return c.json({ error: { code: 'UPSTREAM_ERROR', message: err.message } }, 502)
  }

  if (err && typeof err === 'object' && 'status' in err) {
    const status = (err as { status: unknown }).status
    if (status === 401) {
      return c.json(
        { error: { code: 'BAD_CREDENTIALS', message: 'GitHub rejected the session' } },
        401,
      )
    }
    if (status === 403 || status === 429) {
      const headers = ((err as { response?: { headers?: Record<string, string | undefined> } })
        .response?.headers ?? {})
      const retryAfter = headers['retry-after']
      const reset = headers['x-ratelimit-reset']
      const resetAt = retryAfter
        ? new Date(Date.now() + Number(retryAfter) * 1000).toISOString()
        : reset
          ? new Date(Number(reset) * 1000).toISOString()
          : undefined
      return c.json(
        { error: { code: 'RATE_LIMITED', message: 'GitHub API rate limit reached', resetAt } },
        429,
      )
    }
  }

  console.error('prs handler error:', err)
  return c.json(
    { error: { code: 'UPSTREAM_ERROR', message: 'Failed to fetch pull requests' } },
    502,
  )
}

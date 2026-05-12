import { GraphqlResponseError } from '@octokit/graphql'
import { type Context, Hono } from 'hono'
import {
  type Bucket,
  BucketedResponseSchema,
  type PullRequest,
} from '@prq/shared'
import { fetchPullRequests } from '../github/client'
import { RawResponseSchema } from '../github/schema'
import { transform } from '../github/transform'

export const prs = new Hono()

prs.get('/prs', async (c) => {
  try {
    const raw = await fetchPullRequests()
    const validated = RawResponseSchema.parse(raw)
    const { viewerLogin, rateLimit, pullRequests } = transform(validated)

    const buckets: Record<Bucket, PullRequest[]> = {
      review: [],
      attention: [],
      ready: [],
      waiting: [],
      drafts: [],
    }
    for (const pr of pullRequests) buckets[pr.bucket].push(pr)

    const body = BucketedResponseSchema.parse({
      viewerLogin,
      buckets,
      syncedAt: new Date().toISOString(),
      rateLimit,
    })
    return c.json(body)
  } catch (err) {
    return mapError(c, err)
  }
})

function mapError(c: Context, err: unknown) {
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
        { error: { code: 'BAD_CREDENTIALS', message: 'GitHub PAT was rejected' } },
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

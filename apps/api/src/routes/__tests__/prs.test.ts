import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchPullRequests } from '../../github/client'
import { makeRawPr, makeRawResponse } from '../../github/__tests__/fixtures'
import { prs } from '../prs'

vi.mock('../../github/client', () => ({
  fetchPullRequests: vi.fn(),
}))

const mockedFetch = vi.mocked(fetchPullRequests)

const rawForRepos = (entries: Array<{ owner: string, name: string, id: string }>) =>
  makeRawResponse({
    authored: entries.map(({ owner, name, id }) =>
      makeRawPr({
        id,
        repository: { name, owner: { login: owner } },
      }),
    ),
  })

const makeApp = () => new Hono().route('/api', prs)

const WITH_COOKIE = { headers: { cookie: 'prq_pat=test-pat' } }

beforeEach(() => {
  mockedFetch.mockReset()
})

describe('GET /api/prs', () => {
  it('empty repos param → no PRs in buckets, full trackableRepos returned', async () => {
    mockedFetch.mockResolvedValue(rawForRepos([
      { owner: 'vercel', name: 'next.js', id: 'PR_a' },
      { owner: 'facebook', name: 'react', id: 'PR_b' },
    ]))

    const res = await makeApp().request('/api/prs', WITH_COOKIE)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.buckets.review).toEqual([])
    expect(body.buckets.attention).toEqual([])
    expect(body.buckets.ready).toEqual([])
    expect(body.buckets.waiting).toEqual([])
    expect(body.buckets.drafts).toEqual([])
    expect(body.trackableRepos).toEqual([
      { owner: 'facebook', name: 'react', prCount: 1 },
      { owner: 'vercel', name: 'next.js', prCount: 1 },
    ])
  })

  it('allowlist filter keeps only matching PRs; trackableRepos remains pre-filter', async () => {
    mockedFetch.mockResolvedValue(rawForRepos([
      { owner: 'vercel', name: 'next.js', id: 'PR_a' },
      { owner: 'facebook', name: 'react', id: 'PR_b' },
    ]))

    const res = await makeApp().request('/api/prs?repos=vercel%2Fnext.js', WITH_COOKIE)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.buckets.waiting).toHaveLength(1)
    expect(body.buckets.waiting[0].repository).toEqual({ owner: 'vercel', name: 'next.js' })
    expect(body.trackableRepos).toHaveLength(2)
  })

  it('accepts double-encoded slash (server-side defensive decode)', async () => {
    mockedFetch.mockResolvedValue(rawForRepos([
      { owner: 'vercel', name: 'next.js', id: 'PR_a' },
    ]))

    const res = await makeApp().request(
      '/api/prs?repos=vercel%252Fnext.js',
      WITH_COOKIE,
    )
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.buckets.waiting).toHaveLength(1)
  })

  it('returns 200 with empty buckets when ?repos= contains a malformed % escape', async () => {
    mockedFetch.mockResolvedValue(rawForRepos([
      { owner: 'vercel', name: 'next.js', id: 'PR_a' },
    ]))

    // decodeURIComponent('foo%') throws URIError; the route must not 502.
    const res = await makeApp().request('/api/prs?repos=foo%25', WITH_COOKIE)
    // Note: the URL-level %25 = literal `%` character. After Hono decodes
    // once, the route sees `foo%` which decodeURIComponent would throw on.
    // The try/catch keeps the request alive; allowSet ends up empty.
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.buckets.waiting).toEqual([])
    expect(body.buckets.review).toEqual([])
    expect(body.buckets.attention).toEqual([])
    expect(body.buckets.ready).toEqual([])
    expect(body.buckets.drafts).toEqual([])
  })

  it('malformed repos entries are silently dropped (never 400)', async () => {
    mockedFetch.mockResolvedValue(rawForRepos([
      { owner: 'vercel', name: 'next.js', id: 'PR_a' },
    ]))

    const res = await makeApp().request(
      '/api/prs?repos=garbage,vercel%2Fnext.js,too%2Fmany%2Fslashes',
      WITH_COOKIE,
    )
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.buckets.waiting).toHaveLength(1)
    expect(body.buckets.waiting[0].repository).toEqual({ owner: 'vercel', name: 'next.js' })
  })

  it('trackableRepos aggregates prCount across same-repo PRs', async () => {
    mockedFetch.mockResolvedValue(rawForRepos([
      { owner: 'vercel', name: 'next.js', id: 'PR_a' },
      { owner: 'vercel', name: 'next.js', id: 'PR_b' },
      { owner: 'facebook', name: 'react', id: 'PR_c' },
    ]))

    const res = await makeApp().request('/api/prs', WITH_COOKIE)
    const body = await res.json()

    expect(body.trackableRepos).toEqual([
      { owner: 'facebook', name: 'react', prCount: 1 },
      { owner: 'vercel', name: 'next.js', prCount: 2 },
    ])
  })

  it('trackableRepos includes owned repos with prCount: 0 (no PRs)', async () => {
    mockedFetch.mockResolvedValue(
      makeRawResponse({
        ownedRepos: [
          { owner: 'haji', name: 'dotfiles' },
          { owner: 'haji', name: 'salahtimes' },
        ],
      }),
    )

    const res = await makeApp().request('/api/prs', WITH_COOKIE)
    const body = await res.json()

    expect(body.trackableRepos).toEqual([
      { owner: 'haji', name: 'dotfiles', prCount: 0 },
      { owner: 'haji', name: 'salahtimes', prCount: 0 },
    ])
  })

  it('trackableRepos merges owned repos with PR-derived repos', async () => {
    mockedFetch.mockResolvedValue(
      makeRawResponse({
        ownedRepos: [
          { owner: 'haji', name: 'dotfiles' },
          { owner: 'haji', name: 'salahtimes' },
        ],
        authored: [
          makeRawPr({
            id: 'PR_owned',
            repository: { name: 'salahtimes', owner: { login: 'haji' } },
          }),
          makeRawPr({
            id: 'PR_external',
            repository: { name: 'next.js', owner: { login: 'vercel' } },
          }),
        ],
      }),
    )

    const res = await makeApp().request('/api/prs', WITH_COOKIE)
    const body = await res.json()

    expect(body.trackableRepos).toEqual([
      { owner: 'haji', name: 'dotfiles', prCount: 0 },
      { owner: 'haji', name: 'salahtimes', prCount: 1 },
      { owner: 'vercel', name: 'next.js', prCount: 1 },
    ])
  })

  it('no prq_pat cookie → 401 BAD_CREDENTIALS without hitting GitHub', async () => {
    const res = await makeApp().request('/api/prs')
    expect(res.status).toBe(401)

    const body = await res.json()
    expect(body.error.code).toBe('BAD_CREDENTIALS')
    expect(mockedFetch).not.toHaveBeenCalled()
  })
})

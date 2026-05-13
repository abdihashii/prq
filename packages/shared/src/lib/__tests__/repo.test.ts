import { describe, expect, it } from 'vitest'
import type { PullRequest } from '../../types/pullRequest'
import { mergeTrackableRepos, parseRepoList } from '../repo'

describe('parseRepoList', () => {
  it('returns [] for undefined', () => {
    expect(parseRepoList(undefined)).toEqual([])
  })

  it('returns [] for empty string', () => {
    expect(parseRepoList('')).toEqual([])
  })

  it('parses a single entry', () => {
    expect(parseRepoList('foo/bar')).toEqual(['foo/bar'])
  })

  it('parses multiple entries', () => {
    expect(parseRepoList('foo/bar,baz/qux')).toEqual(['foo/bar', 'baz/qux'])
  })

  it('trims whitespace around entries', () => {
    expect(parseRepoList(' foo/bar , baz/qux ')).toEqual(['foo/bar', 'baz/qux'])
  })

  it('deduplicates while preserving first-seen order', () => {
    expect(parseRepoList('foo/bar,baz/qux,foo/bar')).toEqual(['foo/bar', 'baz/qux'])
  })

  it('skips invalid entries silently', () => {
    expect(parseRepoList('foo/bar,garbage,baz/qux,too/many/slashes')).toEqual([
      'foo/bar',
      'baz/qux',
    ])
  })

  it('skips blank entries (consecutive commas)', () => {
    expect(parseRepoList('foo/bar,,baz/qux')).toEqual(['foo/bar', 'baz/qux'])
  })

  it('rejects whitespace inside entries', () => {
    expect(parseRepoList('foo /bar')).toEqual([])
  })
})

type PrFixture = Pick<PullRequest, 'repository'>

const pr = (owner: string, name: string): PrFixture => ({ repository: { owner, name } })
const repo = (owner: string, name: string) => ({ owner, name })

describe('mergeTrackableRepos', () => {
  it('returns [] when both inputs are empty', () => {
    expect(mergeTrackableRepos([], [] as PullRequest[])).toEqual([])
  })

  it('emits owned repos with prCount: 0 when no PRs match', () => {
    expect(
      mergeTrackableRepos(
        [repo('haji', 'dotfiles'), repo('haji', 'salahtimes')],
        [] as PullRequest[],
      ),
    ).toEqual([
      { owner: 'haji', name: 'dotfiles', prCount: 0 },
      { owner: 'haji', name: 'salahtimes', prCount: 0 },
    ])
  })

  it('counts PRs against matching owned repos', () => {
    expect(
      mergeTrackableRepos(
        [repo('haji', 'salahtimes')],
        [pr('haji', 'salahtimes'), pr('haji', 'salahtimes')] as PullRequest[],
      ),
    ).toEqual([{ owner: 'haji', name: 'salahtimes', prCount: 2 }])
  })

  it('includes repos that appear only in PRs (e.g. review-requested non-owned)', () => {
    expect(
      mergeTrackableRepos(
        [repo('haji', 'dotfiles')],
        [pr('vercel', 'next.js')] as PullRequest[],
      ),
    ).toEqual([
      { owner: 'haji', name: 'dotfiles', prCount: 0 },
      { owner: 'vercel', name: 'next.js', prCount: 1 },
    ])
  })

  it('returns results sorted alphabetically by owner/name', () => {
    const result = mergeTrackableRepos(
      [repo('zzz', 'a'), repo('aaa', 'z'), repo('mmm', 'm')],
      [] as PullRequest[],
    )
    expect(result.map(r => `${r.owner}/${r.name}`)).toEqual([
      'aaa/z',
      'mmm/m',
      'zzz/a',
    ])
  })

  it('does not duplicate owned repos that also appear in PRs', () => {
    const result = mergeTrackableRepos(
      [repo('haji', 'salahtimes')],
      [pr('haji', 'salahtimes')] as PullRequest[],
    )
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ owner: 'haji', name: 'salahtimes', prCount: 1 })
  })
})

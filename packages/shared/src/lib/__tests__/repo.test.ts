import { describe, expect, it } from 'vitest'
import type { PullRequest } from '../../types/pullRequest'
import { parseRepoList, summarizeSeenRepos } from '../repo'

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

describe('summarizeSeenRepos', () => {
  it('returns [] for no PRs', () => {
    expect(summarizeSeenRepos([] as PullRequest[])).toEqual([])
  })

  it('counts a single PR', () => {
    expect(summarizeSeenRepos([pr('vercel', 'next.js')] as PullRequest[])).toEqual([
      { owner: 'vercel', name: 'next.js', prCount: 1 },
    ])
  })

  it('aggregates PRs from the same repo', () => {
    expect(
      summarizeSeenRepos([
        pr('vercel', 'next.js'),
        pr('vercel', 'next.js'),
        pr('vercel', 'next.js'),
      ] as PullRequest[]),
    ).toEqual([{ owner: 'vercel', name: 'next.js', prCount: 3 }])
  })

  it('returns results sorted alphabetically by owner/name', () => {
    const result = summarizeSeenRepos([
      pr('zzz', 'a'),
      pr('aaa', 'z'),
      pr('mmm', 'm'),
    ] as PullRequest[])

    expect(result.map(r => `${r.owner}/${r.name}`)).toEqual([
      'aaa/z',
      'mmm/m',
      'zzz/a',
    ])
  })

  it('keeps prCount accurate across mixed repos', () => {
    const result = summarizeSeenRepos([
      pr('aaa', 'one'),
      pr('bbb', 'two'),
      pr('aaa', 'one'),
      pr('bbb', 'two'),
      pr('aaa', 'one'),
    ] as PullRequest[])

    expect(result).toEqual([
      { owner: 'aaa', name: 'one', prCount: 3 },
      { owner: 'bbb', name: 'two', prCount: 2 },
    ])
  })
})

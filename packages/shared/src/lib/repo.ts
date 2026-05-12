import type { PullRequest } from '../types/pullRequest'
import type { TrackableRepo } from '../types/trackableRepo'

const REPO_SLUG_RE = /^[^/\s]+\/[^/\s]+$/

/**
 * Parse a comma-separated list of `owner/repo` slugs from an untrusted source
 * (typically a URL query param). Trims whitespace, deduplicates while
 * preserving first-seen order, and silently drops malformed entries — the
 * caller should never 400 on bad input.
 *
 * @param input - Raw string like `"foo/bar,baz/qux"`, or `undefined` when the
 *   param is absent.
 * @returns Validated, deduped slugs in first-seen order. Empty array on
 *   empty/undefined input.
 *
 * @example
 * parseRepoList('vercel/next.js,facebook/react')
 * // => ['vercel/next.js', 'facebook/react']
 *
 * @example
 * // Dedupes and silently drops malformed entries
 * parseRepoList('foo/bar, garbage , foo/bar , too/many/slashes')
 * // => ['foo/bar']
 *
 * @example
 * parseRepoList(undefined)
 * // => []
 */
export function parseRepoList(input: string | undefined): string[] {
  if (!input) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of input.split(',')) {
    const trimmed = part.trim()
    if (!trimmed) continue
    if (!REPO_SLUG_RE.test(trimmed)) continue
    if (seen.has(trimmed)) continue
    seen.add(trimmed)
    out.push(trimmed)
  }
  return out
}

/**
 * Collapse a list of pull requests into per-repo summary entries for the
 * settings picker. Each distinct `owner/name` becomes one entry with the
 * count of PRs from that repo in the input. Output is sorted alphabetically
 * by `owner/name` so the frontend can render directly without re-sorting.
 *
 * @param prs - Pre-filter pull requests. Pass the full list so the picker
 *   can show repos the user might want to opt into, not just repos that
 *   survived filtering.
 * @returns One entry per distinct repo, alphabetically sorted, with
 *   `prCount` matching occurrences in the input.
 *
 * @example
 * summarizeTrackableRepos([
 *   { repository: { owner: 'vercel', name: 'next.js' }, ...},
 *   { repository: { owner: 'vercel', name: 'next.js' }, ...},
 *   { repository: { owner: 'facebook', name: 'react' }, ...},
 * ])
 * // => [
 * //   { owner: 'facebook', name: 'react', prCount: 1 },
 * //   { owner: 'vercel', name: 'next.js', prCount: 2 },
 * // ]
 *
 * @example
 * summarizeTrackableRepos([])
 * // => []
 */
export function summarizeTrackableRepos(prs: PullRequest[]): TrackableRepo[] {
  const map = new Map<string, TrackableRepo>()
  for (const pr of prs) {
    const key = `${pr.repository.owner}/${pr.repository.name}`
    const existing = map.get(key)
    if (existing) {
      existing.prCount += 1
    }
    else {
      map.set(key, { owner: pr.repository.owner, name: pr.repository.name, prCount: 1 })
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    const ak = `${a.owner}/${a.name}`
    const bk = `${b.owner}/${b.name}`
    return ak < bk ? -1 : ak > bk ? 1 : 0
  })
}

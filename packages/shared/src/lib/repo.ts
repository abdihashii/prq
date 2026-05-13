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
 * Build the universe of repos the settings picker shows: the user's owned
 * repositories (fetched server-side from GitHub) merged with any repo that
 * appears in their PR firehose. Repos with at least one matching PR get
 * `prCount` set to that count; owned repos without open PRs get `prCount: 0`.
 * Output is sorted alphabetically by `owner/name` so the frontend can render
 * directly without re-sorting.
 *
 * @param ownedRepos - Repos returned by GitHub's `viewer.repositories`
 *   (owner-affiliation only). Provides the baseline universe.
 * @param prs - Pre-filter pull requests. Any repo here that isn't in
 *   `ownedRepos` is added (e.g., review-requested on a repo the viewer
 *   doesn't own).
 * @returns One entry per distinct repo, alphabetically sorted.
 *
 * @example
 * mergeTrackableRepos(
 *   [{ owner: 'haji', name: 'dotfiles' }, { owner: 'haji', name: 'salahtimes' }],
 *   [{ repository: { owner: 'haji', name: 'salahtimes' }, ...}],
 * )
 * // => [
 * //   { owner: 'haji', name: 'dotfiles',  prCount: 0 },
 * //   { owner: 'haji', name: 'salahtimes', prCount: 1 },
 * // ]
 *
 * @example
 * // Review-requested on a repo the viewer doesn't own — included anyway.
 * mergeTrackableRepos(
 *   [{ owner: 'haji', name: 'dotfiles' }],
 *   [{ repository: { owner: 'vercel', name: 'next.js' }, ...}],
 * )
 * // => [
 * //   { owner: 'haji', name: 'dotfiles', prCount: 0 },
 * //   { owner: 'vercel', name: 'next.js', prCount: 1 },
 * // ]
 *
 * @example
 * mergeTrackableRepos([], [])
 * // => []
 */
export function mergeTrackableRepos(
  ownedRepos: ReadonlyArray<{ owner: string, name: string }>,
  prs: PullRequest[],
): TrackableRepo[] {
  const map = new Map<string, TrackableRepo>()
  for (const r of ownedRepos) {
    map.set(`${r.owner}/${r.name}`, { owner: r.owner, name: r.name, prCount: 0 })
  }
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

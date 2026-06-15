import type { TrackableRepo, TrackingState } from '@prq/shared'

export const TRACKING_ALL_THRESHOLD = 10
export const UNSEEDED_TRACKING: TrackingState = { mode: 'all' }

/**
 * Choose the initial tracking mode for a fresh viewer based on the size of
 * their install-scope universe. Small scopes seed to All (no onboarding wall);
 * large scopes seed to Custom with an empty selection (guided pick).
 *
 * @param universe - Full set of repos prq can access for this viewer.
 * @param threshold - Inclusive cutoff at or below which All is chosen.
 * @returns `{ mode: 'all' }` when the universe is at most `threshold` repos,
 *   otherwise `{ mode: 'custom', repos: [] }`.
 *
 * @example
 * seedTracking([{ owner: 'a', name: 'b', prCount: 0 }], 10)
 * // => { mode: 'all' }
 *
 * @example
 * // 11 repos with threshold 10
 * seedTracking(elevenRepos, 10)
 * // => { mode: 'custom', repos: [] }
 */
export function seedTracking(universe: TrackableRepo[], threshold: number): TrackingState {
  return universe.length <= threshold ? { mode: 'all' } : { mode: 'custom', repos: [] }
}

/**
 * Convert a tracking state into the `?repos` query value for `/api/prs`.
 *
 * @param state - Current tracking state.
 * @returns `null` to omit the param entirely (All mode), or a comma-joined
 *   string (Custom mode), which may be empty when no repos are selected.
 *
 * @example
 * toReposParam({ mode: 'all' }) // => null
 *
 * @example
 * toReposParam({ mode: 'custom', repos: ['a/b', 'c/d'] }) // => 'a/b,c/d'
 *
 * @example
 * toReposParam({ mode: 'custom', repos: [] }) // => ''
 */
export function toReposParam(state: TrackingState): string | null {
  return state.mode === 'all' ? null : state.repos.join(',')
}

/**
 * Toggle a repo slug in the custom selection. No-op when not in custom mode.
 *
 * @param state - Current tracking state.
 * @param slug - Repo slug (`owner/name`) to add or remove.
 * @returns The unchanged state in All mode; otherwise a new custom state with
 *   the slug added (if absent) or removed (if present).
 *
 * @example
 * toggleRepo({ mode: 'custom', repos: ['a/b'] }, 'c/d')
 * // => { mode: 'custom', repos: ['a/b', 'c/d'] }
 *
 * @example
 * toggleRepo({ mode: 'all' }, 'c/d') // => { mode: 'all' }
 */
export function toggleRepo(state: TrackingState, slug: string): TrackingState {
  if (state.mode !== 'custom') return state
  const next = new Set(state.repos)
  if (next.has(slug)) next.delete(slug)
  else next.add(slug)
  return { mode: 'custom', repos: [...next] }
}

/**
 * Switch tracking mode. Switching to All discards the selection. Switching to
 * Custom from All preselects the whole universe; staying in Custom is a no-op.
 *
 * @param state - Current tracking state.
 * @param mode - Target mode.
 * @param universe - Full set of repos prq can access, used to preselect when
 *   switching from All to Custom.
 * @returns `{ mode: 'all' }` for All; the existing custom state when already
 *   custom; or a new custom state preselecting the whole universe when
 *   switching from All.
 *
 * @example
 * setMode({ mode: 'all' }, 'custom', [{ owner: 'a', name: 'b', prCount: 0 }])
 * // => { mode: 'custom', repos: ['a/b'] }
 *
 * @example
 * setMode({ mode: 'custom', repos: ['a/b'] }, 'all', [])
 * // => { mode: 'all' }
 */
export function setMode(
  state: TrackingState,
  mode: 'all' | 'custom',
  universe: TrackableRepo[],
): TrackingState {
  if (mode === 'all') return { mode: 'all' }
  if (state.mode === 'custom') return state
  return { mode: 'custom', repos: universe.map(r => `${r.owner}/${r.name}`) }
}

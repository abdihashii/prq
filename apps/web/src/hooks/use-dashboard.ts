import { useEffect, useState } from 'react'
import type {
  DashboardResponse,
  Installation,
  PollingMs,
  TrackableRepo,
  TrackingState,
} from '@prq/shared'
import { usePullRequests } from '@/hooks/use-pull-requests'
import { useSettings } from '@/hooks/use-settings'
import { ApiError } from '@/lib/api-error'
import { countDisplayItemPrs } from '@/lib/dashboard-display/dashboard-display'
import {
  seedTracking,
  TRACKING_ALL_THRESHOLD,
  UNSEEDED_TRACKING,
} from '@/lib/tracking/tracking'

export interface DashboardSettings {
  pollingMs: PollingMs
  tracking: TrackingState
  trackableRepos: TrackableRepo[]
  installations: Installation[]
  trackableReposLoading: boolean
  setPollingMs: (next: PollingMs) => void
  setTracking: (next: TrackingState) => void
}

interface DashboardCommon {
  /** Non-fatal error to surface in a banner over the body (auth errors go to `signed-out`). */
  error: Error | undefined
  retry: () => void
  badgeCount: number
  sync: { dataUpdatedAt: number, isFetching: boolean }
  signedOut: boolean
  onAuthChange: (signedIn: boolean) => void
  settings: DashboardSettings
}

/**
 * What the route should render below the header. The data-bearing variant is
 * the only one that carries `data`, so an illegal "ready but no data" state is
 * unrepresentable.
 */
export type UseDashboardResult = DashboardCommon & (
  | { state: 'signed-out' }
  | { state: 'loading' }
  | { state: 'onboarding' }
  | { state: 'ready', data: DashboardResponse }
)

export function useDashboard(): UseDashboardResult {
  const [viewerLogin, setViewerLogin] = useState<string | null>(null)
  // Explicit signed-out state — gates query fetching so we don't burn a
  // round-trip on /prs when we already know the answer (either we just deleted
  // the cookie, or a previous fetch already returned 401).
  const [signedOut, setSignedOut] = useState(false)

  const { pollingMs, tracking, hydrated, setPollingMs, setTracking } = useSettings(viewerLogin)
  const effectiveTracking = tracking ?? UNSEEDED_TRACKING
  const query = usePullRequests({ pollingMs, tracking: effectiveTracking, enabled: !signedOut })

  useEffect(() => {
    const next = query.data?.viewerLogin ?? null
    if (next !== null && next !== viewerLogin) setViewerLogin(next)
  }, [query.data?.viewerLogin, viewerLogin])

  // Seed a fresh viewer's tracking mode from their install-scope size once the
  // dashboard data (and thus trackableRepos) is available. Small scope -> All;
  // large scope -> empty Custom (guided pick). Gate on `hydrated`: before the
  // viewer's persisted settings have been read, tracking is null only because
  // it hasn't loaded, and seeding then would clobber a returning viewer's
  // stored choice.
  const trackableReposData = query.data?.trackableRepos
  useEffect(() => {
    if (hydrated && tracking === null && trackableReposData !== undefined) {
      setTracking(seedTracking(trackableReposData, TRACKING_ALL_THRESHOLD))
    }
  }, [hydrated, tracking, trackableReposData, setTracking])

  const fatalAuthError
    = signedOut
      || (query.error instanceof ApiError && query.error.code === 'BAD_CREDENTIALS')

  // Latch signedOut on the first BAD_CREDENTIALS so polling stops — otherwise
  // refetchInterval would keep re-firing /prs against a known-bad cookie.
  useEffect(() => {
    if (query.error instanceof ApiError && query.error.code === 'BAD_CREDENTIALS') {
      setSignedOut(true)
    }
  }, [query.error])

  const badgeCount = fatalAuthError
    ? 0
    : countBucketPrs(query.data?.buckets.review) + countBucketPrs(query.data?.buckets.attention)

  // Gate auth-derived data so a transient query.data preserved from a prior
  // session can't surface in the settings picker after sign-out.
  const trackableRepos = fatalAuthError ? [] : (query.data?.trackableRepos ?? [])
  const installations = fatalAuthError ? [] : (query.data?.installations ?? [])
  // Loading = no data yet AND not in a definitive signed-out state. Covers the
  // initial fetch, post-sign-in (cache cleared), and post-account-swap.
  // Background refetches stay silent — query.data persists, isPending=false.
  const trackableReposLoading = query.isPending && !fatalAuthError && !signedOut

  const onAuthChange = (nowSignedIn: boolean) => {
    setViewerLogin(null)
    setSignedOut(!nowSignedIn)
  }

  // Resolve the seed synchronously at render time once settings are hydrated and
  // data is available, rather than waiting for the seeding effect to commit.
  // Without this, a fresh viewer shows the skeleton for the render(s) between
  // data arriving and the effect running, even though their PRs are already in
  // hand. Gated on `hydrated` for the same reason as the effect: a pre-hydration
  // null must stay null (skeleton), not seed over a returning viewer's choice.
  const resolvedTracking
    = tracking
      ?? (hydrated && trackableReposData !== undefined
        ? seedTracking(trackableReposData, TRACKING_ALL_THRESHOLD)
        : null)
  const isGuidedPick
    = resolvedTracking?.mode === 'custom' && resolvedTracking.repos.length === 0

  const common: DashboardCommon = {
    error: fatalAuthError ? undefined : (query.error ?? undefined),
    retry: () => {
      void query.refetch()
    },
    badgeCount,
    sync: { dataUpdatedAt: query.dataUpdatedAt, isFetching: query.isFetching },
    signedOut,
    onAuthChange,
    settings: {
      pollingMs,
      tracking: effectiveTracking,
      trackableRepos,
      installations,
      trackableReposLoading,
      setPollingMs,
      setTracking,
    },
  }

  if (fatalAuthError) return { ...common, state: 'signed-out' }
  // Gate onboarding on viewerLogin so the empty state can't render in the brief
  // window between query resolution and useSettings hydrating from localStorage,
  // otherwise returning users see an onboarding flash before their persisted
  // tracking loads. Show the guided-pick state only once tracking has resolved
  // to empty Custom.
  if (query.data !== undefined && viewerLogin !== null && isGuidedPick) {
    return { ...common, state: 'onboarding' }
  }
  // Render the dashboard as soon as data and a resolved (seeded) tracking exist,
  // except for the empty-Custom guided-pick case which belongs to onboarding.
  if (query.data !== undefined && resolvedTracking !== null && !isGuidedPick) {
    return { ...common, state: 'ready', data: query.data }
  }
  return { ...common, state: 'loading' }
}

function countBucketPrs(items: Parameters<typeof countDisplayItemPrs>[0][] | undefined): number {
  return items?.reduce((count, item) => count + countDisplayItemPrs(item), 0) ?? 0
}

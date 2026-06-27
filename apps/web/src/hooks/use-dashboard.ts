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
import { useTokenHealth } from '@/hooks/use-token-health'
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
  // Explicit signed-out state — gates fetching so we don't burn a round-trip on
  // /user and /prs when we already know the answer (either we just deleted the
  // cookie, or a previous fetch already returned 401). Latched below.
  const [signedOut, setSignedOut] = useState(false)

  // Bootstrap viewerLogin from the cheap /api/user (a DB session lookup, no
  // GitHub crawl), NOT the expensive /api/prs response. Decoupling identity from
  // the crawl lets the returning viewer's settings hydrate before the first
  // fetch, so /api/prs runs exactly once already scoped. AuthSection mounts the
  // same useTokenHealth({ enabled: !signedOut }); the shared ['token-health']
  // query key dedupes both consumers to a single /api/user call.
  const tokenHealth = useTokenHealth({ enabled: !signedOut })
  const viewerLogin = signedOut ? null : tokenHealth.data?.login ?? null

  const { pollingMs, tracking, hydrated, setPollingMs, setTracking } = useSettings(viewerLogin)
  const effectiveTracking = tracking ?? UNSEEDED_TRACKING

  // Gate the crawl until identity is known AND the viewer's settings have
  // hydrated. `hydrated` derives from /api/user (a different query than the one
  // gated here), so this cannot deadlock; and on render 0 it is false, so the
  // premature All-mode /api/prs never fires.
  const settingsReady = !signedOut && hydrated
  const query = usePullRequests({ pollingMs, tracking: effectiveTracking, enabled: settingsReady })

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

  // A 401 from EITHER endpoint is fatal. /api/user now gates /api/prs, so a bad
  // cookie surfaces on /api/user first; folding it in here drops straight to
  // sign-in instead of stranding on the skeleton.
  const fatalAuthError = signedOut || isBadCreds(tokenHealth.error) || isBadCreds(query.error)

  // Latch signedOut on the first BAD_CREDENTIALS so polling stops — otherwise
  // refetchInterval would keep re-firing against a known-bad cookie.
  useEffect(() => {
    if (isBadCreds(tokenHealth.error) || isBadCreds(query.error)) setSignedOut(true)
  }, [tokenHealth.error, query.error])

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

  // viewerLogin is derived from tokenHealth, so there is no local login state to
  // reset here. Sign-out also removeQueries(['token-health']) in AuthSection,
  // which clears tokenHealth.data and drops viewerLogin back to null.
  const onAuthChange = (nowSignedIn: boolean) => {
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
    // Surface a non-auth /api/user failure (retry:false makes it terminal) as a
    // retryable banner instead of an indefinite skeleton; /api/prs errors keep
    // their existing banner. Auth errors go to the signed-out state instead.
    error: fatalAuthError ? undefined : ((tokenHealth.error ?? query.error) ?? undefined),
    retry: () => {
      if (tokenHealth.isError) void tokenHealth.refetch()
      else void query.refetch()
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

function isBadCreds(error: unknown): error is ApiError {
  return error instanceof ApiError && error.code === 'BAD_CREDENTIALS'
}

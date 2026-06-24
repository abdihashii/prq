import { createFileRoute } from '@tanstack/react-router'
import { Settings } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Installation } from '@prq/shared'
import { Dashboard } from '@/components/dashboard'
import { DashboardSkeleton } from '@/components/dashboard-skeleton'
import { ErrorBanner } from '@/components/error-banner'
import { LastSynced } from '@/components/last-synced'
import { ManageAccess } from '@/components/manage-access'
import { SignInPage } from '@/components/sign-in-page'
import { SettingsPanel } from '@/components/settings-panel'
import { Button } from '@/components/ui/button'
import { useNotificationBadge } from '@/hooks/use-notification-badge'
import { usePullRequests } from '@/hooks/use-pull-requests'
import { useSettings } from '@/hooks/use-settings'
import { useTheme } from '@/hooks/use-theme'
import { ApiError } from '@/lib/api-error'
import { countDisplayItemPrs } from '@/lib/dashboard-display/dashboard-display'
import {
  seedTracking,
  TRACKING_ALL_THRESHOLD,
  UNSEEDED_TRACKING,
} from '@/lib/tracking/tracking'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [viewerLogin, setViewerLogin] = useState<string | null>(null)
  // Explicit signed-out state — gates query fetching so we don't burn a
  // round-trip on /prs and /user when we already know the answer (either
  // we just deleted the cookie, or a previous fetch already returned 401).
  const [signedOut, setSignedOut] = useState(false)

  const { pollingMs, tracking, hydrated, setPollingMs, setTracking } = useSettings(viewerLogin)
  const { resolvedTheme, setTheme } = useTheme()
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

  const fatalAuthError =
    signedOut
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
  useNotificationBadge(badgeCount)

  // Gate auth-derived data at render time so a transient query.data preserved
  // from a prior session can't surface in the settings picker after sign-out.
  const trackableRepos = fatalAuthError ? [] : (query.data?.trackableRepos ?? [])
  const installations = fatalAuthError ? [] : (query.data?.installations ?? [])
  // Loading = no data yet AND not in a definitive signed-out state. Covers
  // the initial fetch, post-sign-in (cache cleared), and post-account-swap.
  // Background refetches stay silent — query.data persists, isPending=false.
  const trackableReposLoading = query.isPending && !fatalAuthError && !signedOut

  const handleAuthChange = (nowSignedIn: boolean) => {
    setViewerLogin(null)
    setSignedOut(!nowSignedIn)
  }
  // Resolve the seed synchronously at render time once settings are hydrated and
  // data is available, rather than waiting for the seeding effect to commit.
  // Without this, a fresh viewer shows DashboardSkeleton for the render(s)
  // between data arriving and the effect running, even though their PRs are
  // already in hand. Gated on `hydrated` for the same reason as the effect: a
  // pre-hydration null must stay null (skeleton), not seed over a returning
  // viewer's persisted choice. The effect above still persists the seed.
  const resolvedTracking
    = tracking
      ?? (hydrated && trackableReposData !== undefined
        ? seedTracking(trackableReposData, TRACKING_ALL_THRESHOLD)
        : null)
  const isGuidedPick
    = resolvedTracking?.mode === 'custom' && resolvedTracking.repos.length === 0

  // Gate on viewerLogin so the empty state can't render in the brief window
  // between query resolution and useSettings hydrating from localStorage,
  // otherwise returning users see an onboarding flash before their persisted
  // tracking loads. Show the guided-pick state only once tracking has resolved
  // to empty Custom.
  const showOnboarding
    = !fatalAuthError
      && query.data !== undefined
      && viewerLogin !== null
      && isGuidedPick
  // Render the dashboard as soon as data and a resolved (seeded) tracking exist,
  // except for the empty-Custom guided-pick case which belongs to onboarding.
  // Keying on resolvedTracking instead of the not-yet-committed `tracking` is
  // what removes the post-data skeleton flash; excluding guided-pick keeps a
  // large-scope viewer from flashing the firehose before onboarding appears.
  const showDashboard
    = !fatalAuthError
      && query.data !== undefined
      && resolvedTracking !== null
      && !isGuidedPick

  return (
    <>
      <SettingsPanel
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        pollingMs={pollingMs}
        tracking={effectiveTracking}
        trackableRepos={trackableRepos}
        installations={installations}
        trackableReposLoading={trackableReposLoading}
        resolvedTheme={resolvedTheme}
        onPollingMsChange={setPollingMs}
        onTrackingChange={setTracking}
        onThemeChange={setTheme}
        onAuthChange={handleAuthChange}
        signedOut={signedOut}
      />
      {fatalAuthError ? (
        <SignInPage />
      ) : (
        <main className="mx-auto max-w-3xl p-6">
          <header className="mb-4 flex items-center justify-between">
            <h1 className="font-mono text-3xl font-semibold tracking-tight">prq</h1>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSettingsOpen(true)}
                aria-label="Settings"
              >
                <Settings className="size-4" />
              </Button>
              <LastSynced
                dataUpdatedAt={query.dataUpdatedAt}
                isFetching={query.isFetching}
              />
            </div>
          </header>

          {query.isError && (
            <ErrorBanner
              error={query.error}
              onRetry={() => {
                void query.refetch()
              }}
            />
          )}

          {showOnboarding ? (
            <OnboardingEmptyState
              installations={installations}
              repoCount={trackableRepos.length}
              onTrackAll={() => setTracking({ mode: 'all' })}
              onOpenSettings={() => setSettingsOpen(true)}
            />
          ) : showDashboard ? (
            <Dashboard data={query.data} />
          ) : (
            <DashboardSkeleton />
          )}
        </main>
      )}
    </>
  )
}

function countBucketPrs(items: Parameters<typeof countDisplayItemPrs>[0][] | undefined): number {
  return items?.reduce((count, item) => count + countDisplayItemPrs(item), 0) ?? 0
}

function OnboardingEmptyState({
  installations,
  repoCount,
  onTrackAll,
  onOpenSettings,
}: {
  installations: Installation[]
  repoCount: number
  onTrackAll: () => void
  onOpenSettings: () => void
}) {
  return (
    <div className="border-input rounded-md border p-8 text-center">
      <h2 className="text-base font-medium">Pick the repos you want to track</h2>
      <div className="mt-4 flex justify-center gap-2">
        <Button onClick={onTrackAll} size="sm">
          Track all
        </Button>
        <Button onClick={onOpenSettings} size="sm" variant="outline">
          Choose repos
        </Button>
      </div>
      <div className="mt-4 flex justify-center">
        <ManageAccess installations={installations} repoCount={repoCount} />
      </div>
    </div>
  )
}

import { createFileRoute } from '@tanstack/react-router'
import { Settings } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Dashboard } from '@/components/dashboard'
import { DashboardSkeleton } from '@/components/dashboard-skeleton'
import { ErrorBanner } from '@/components/error-banner'
import { LastSynced } from '@/components/last-synced'
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

  const { pollingMs, tracking, setPollingMs, setTracking } = useSettings(viewerLogin)
  const { resolvedTheme, setTheme } = useTheme()
  const effectiveTracking = tracking ?? UNSEEDED_TRACKING
  const query = usePullRequests({ pollingMs, tracking: effectiveTracking, enabled: !signedOut })

  useEffect(() => {
    const next = query.data?.viewerLogin ?? null
    if (next !== null && next !== viewerLogin) setViewerLogin(next)
  }, [query.data?.viewerLogin, viewerLogin])

  // Seed a fresh viewer's tracking mode from their install-scope size once the
  // dashboard data (and thus trackableRepos) is available. Small scope -> All;
  // large scope -> empty Custom (guided pick).
  const trackableReposData = query.data?.trackableRepos
  useEffect(() => {
    if (tracking === null && viewerLogin !== null && trackableReposData !== undefined) {
      setTracking(seedTracking(trackableReposData, TRACKING_ALL_THRESHOLD))
    }
  }, [tracking, viewerLogin, trackableReposData, setTracking])

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
  // Loading = no data yet AND not in a definitive signed-out state. Covers
  // the initial fetch, post-sign-in (cache cleared), and post-account-swap.
  // Background refetches stay silent — query.data persists, isPending=false.
  const trackableReposLoading = query.isPending && !fatalAuthError && !signedOut

  const handleAuthChange = (nowSignedIn: boolean) => {
    setViewerLogin(null)
    setSignedOut(!nowSignedIn)
  }
  // Gate on viewerLogin so the empty state can't render in the brief window
  // between query resolution and useSettings hydrating from localStorage,
  // otherwise returning users see an onboarding flash before their persisted
  // tracking loads. Show the guided-pick state only once tracking has resolved
  // to empty Custom.
  const showOnboarding
    = !fatalAuthError
      && query.data !== undefined
      && viewerLogin !== null
      && effectiveTracking.mode === 'custom'
      && effectiveTracking.repos.length === 0

  return (
    <>
      <SettingsPanel
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        pollingMs={pollingMs}
        tracking={effectiveTracking}
        trackableRepos={trackableRepos}
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
            <OnboardingEmptyState onOpenSettings={() => setSettingsOpen(true)} />
          ) : query.data && tracking !== null ? (
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

function OnboardingEmptyState({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <div className="border-input rounded-md border p-8 text-center">
      <h2 className="text-base font-medium">Select repos in Settings to start tracking PRs.</h2>
      <p className="text-muted-foreground mt-1 text-sm">
        prq filters to repos you opt into. Choose any with open PRs to populate your dashboard.
      </p>
      <Button onClick={onOpenSettings} className="mt-4" size="sm">
        Open Settings
      </Button>
    </div>
  )
}

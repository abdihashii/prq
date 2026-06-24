import { createFileRoute } from '@tanstack/react-router'
import { Settings } from 'lucide-react'
import { useState } from 'react'
import type { Installation } from '@prq/shared'
import { Dashboard } from '@/components/dashboard'
import { DashboardSkeleton } from '@/components/dashboard-skeleton'
import { ErrorBanner } from '@/components/error-banner'
import { LastSynced } from '@/components/last-synced'
import { ManageAccess } from '@/components/manage-access'
import { SignInPage } from '@/components/sign-in-page'
import { SettingsPanel } from '@/components/settings-panel'
import { Button } from '@/components/ui/button'
import { useDashboard } from '@/hooks/use-dashboard'
import { useNotificationBadge } from '@/hooks/use-notification-badge'
import { useTheme } from '@/hooks/use-theme'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { resolvedTheme, setTheme } = useTheme()
  const dashboard = useDashboard()
  useNotificationBadge(dashboard.badgeCount)

  const { settings } = dashboard

  return (
    <>
      <SettingsPanel
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        pollingMs={settings.pollingMs}
        tracking={settings.tracking}
        trackableRepos={settings.trackableRepos}
        installations={settings.installations}
        trackableReposLoading={settings.trackableReposLoading}
        resolvedTheme={resolvedTheme}
        onPollingMsChange={settings.setPollingMs}
        onTrackingChange={settings.setTracking}
        onThemeChange={setTheme}
        onAuthChange={dashboard.onAuthChange}
        signedOut={dashboard.signedOut}
      />
      {dashboard.state === 'signed-out' ? (
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
                dataUpdatedAt={dashboard.sync.dataUpdatedAt}
                isFetching={dashboard.sync.isFetching}
              />
            </div>
          </header>

          {dashboard.error && (
            <ErrorBanner
              error={dashboard.error}
              onRetry={dashboard.retry}
            />
          )}

          {dashboard.state === 'onboarding' ? (
            <OnboardingEmptyState
              installations={settings.installations}
              repoCount={settings.trackableRepos.length}
              onTrackAll={() => settings.setTracking({ mode: 'all' })}
              onOpenSettings={() => setSettingsOpen(true)}
            />
          ) : dashboard.state === 'ready' ? (
            <Dashboard data={dashboard.data} />
          ) : (
            <DashboardSkeleton />
          )}
        </main>
      )}
    </>
  )
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

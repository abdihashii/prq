import type { Meta, StoryObj } from '@storybook/react-vite'
import type { DashboardResponse, PollingMs, Theme, TrackingState } from '@prq/shared'
import { Settings } from 'lucide-react'
import { useState } from 'react'
import { Dashboard } from './dashboard'
import { DashboardSkeleton } from './dashboard-skeleton'
import { ErrorBanner } from './error-banner'
import { LastSynced } from './last-synced'
import { SettingsPanel } from './settings-panel'
import { withQueryClient } from './story-utils/with-query-client'
import { Button } from './ui/button'
import {
  INSTALLATIONS_MULTI,
  TRACKABLE_REPOS,
} from '@/lib/access-fixtures/access-fixtures'
import { TOKEN_HEALTH } from '@/lib/auth-fixtures/auth-fixtures'
import { TOKEN_HEALTH_QUERY_KEY } from '@/hooks/use-token-health'
import type { DashboardDisplayBuckets } from '@/lib/dashboard-display/dashboard-display'
import { ApiError } from '@/lib/api-error'
import {
  BUCKETED_RESPONSE_EMPTY,
  BUCKETED_RESPONSE_NESTED_STACKS,
  BUCKETED_RESPONSE_POPULATED,
  DISPLAY_BUCKETS_NESTED_STACKS,
} from '@/lib/pr-fixtures/pr-fixtures'

interface FullAppProps {
  data?: DashboardResponse
  displayBuckets?: Partial<DashboardDisplayBuckets>
  error?: unknown
  loading?: boolean
  initialSettingsOpen?: boolean
}

/**
 * Assembled app shell: page chrome (title, settings gear, last-synced) over the
 * dashboard, with a working settings sheet. Mirrors the layout and the render
 * branches of the `/` route (skeleton / error banner / dashboard) but drives
 * them from fixtures and local state instead of live queries.
 */
function FullApp({
  data,
  displayBuckets,
  error,
  loading = false,
  initialSettingsOpen = false,
}: FullAppProps) {
  const [settingsOpen, setSettingsOpen] = useState(initialSettingsOpen)
  const [resolvedTheme, setResolvedTheme] = useState<Theme>('light')
  const [pollingMs, setPollingMs] = useState<PollingMs>(30_000)
  const [tracking, setTracking] = useState<TrackingState>({ mode: 'all' })

  return (
    <>
      <SettingsPanel
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        pollingMs={pollingMs}
        tracking={tracking}
        trackableRepos={TRACKABLE_REPOS}
        installations={INSTALLATIONS_MULTI}
        trackableReposLoading={false}
        resolvedTheme={resolvedTheme}
        onPollingMsChange={setPollingMs}
        onTrackingChange={setTracking}
        onThemeChange={setResolvedTheme}
        onAuthChange={() => {}}
        signedOut={false}
      />
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
              githubSyncedAt={loading ? null : new Date(Date.now() - 30_000).toISOString()}
              isFetching={loading}
            />
          </div>
        </header>

        {error ? <ErrorBanner error={error} onRetry={() => {}} /> : null}

        {loading || !data ? (
          <DashboardSkeleton />
        ) : (
          <Dashboard data={data} displayBuckets={displayBuckets} />
        )}
      </main>
    </>
  )
}

const meta = {
  title: 'Composites/App',
  component: FullApp,
  args: { data: BUCKETED_RESPONSE_POPULATED },
  decorators: [withQueryClient(client => client.setQueryData(TOKEN_HEALTH_QUERY_KEY, TOKEN_HEALTH))],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'The whole dashboard assembled: page chrome over the dashboard, with the settings sheet wired to the gear button. Composed from fixtures, not live data.',
      },
    },
  },
} satisfies Meta<typeof FullApp>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Empty: Story = {
  args: { data: BUCKETED_RESPONSE_EMPTY },
}

export const Stacks: Story = {
  args: {
    data: BUCKETED_RESPONSE_NESTED_STACKS,
    displayBuckets: DISPLAY_BUCKETS_NESTED_STACKS,
  },
}

export const Loading: Story = {
  args: { loading: true },
}

export const RefreshFailed: Story = {
  args: {
    error: new ApiError({
      code: 'RATE_LIMITED',
      message: 'GitHub rate limit reached.',
      resetAt: new Date(Date.now() + 8 * 60 * 1000).toISOString(),
    }),
  },
}

export const SettingsOpen: Story = {
  args: { initialSettingsOpen: true },
}

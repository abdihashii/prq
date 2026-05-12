import { createFileRoute } from '@tanstack/react-router'
import { Dashboard } from '@/components/dashboard'
import { DashboardSkeleton } from '@/components/dashboard-skeleton'
import { ErrorBanner } from '@/components/error-banner'
import { LastSynced } from '@/components/last-synced'
import { PatErrorPage } from '@/components/pat-error-page'
import { useNotificationBadge } from '@/hooks/use-notification-badge'
import { usePullRequests } from '@/hooks/use-pull-requests'
import { ApiError } from '@/lib/api-error'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  const query = usePullRequests()

  const fatalAuthError =
    query.error instanceof ApiError && query.error.code === 'BAD_CREDENTIALS'
  const badgeCount = fatalAuthError
    ? 0
    : (query.data?.buckets.review.length ?? 0) +
      (query.data?.buckets.attention.length ?? 0)
  useNotificationBadge(badgeCount)

  if (fatalAuthError) {
    return <PatErrorPage />
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">prq</h1>
        <LastSynced dataUpdatedAt={query.dataUpdatedAt} isFetching={query.isFetching} />
      </header>

      {query.isError && (
        <ErrorBanner
          error={query.error}
          onRetry={() => {
            void query.refetch()
          }}
        />
      )}

      {query.data ? <Dashboard data={query.data} /> : <DashboardSkeleton />}
    </main>
  )
}

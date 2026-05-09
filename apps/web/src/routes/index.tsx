import { createFileRoute } from '@tanstack/react-router'
import { Dashboard } from '#/components/dashboard.js'
import { DashboardSkeleton } from '#/components/dashboard-skeleton.js'
import { ErrorBanner } from '#/components/error-banner.js'
import { LastSynced } from '#/components/last-synced.js'
import { PatErrorPage } from '#/components/pat-error-page.js'
import { usePullRequests } from '#/hooks/use-pull-requests.js'
import { ApiError } from '#/lib/api-error.js'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  const query = usePullRequests()

  if (query.error instanceof ApiError && query.error.code === 'BAD_CREDENTIALS') {
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

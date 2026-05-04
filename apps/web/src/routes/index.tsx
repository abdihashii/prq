import { createFileRoute } from '@tanstack/react-router'
import { Dashboard } from '#/components/dashboard.js'
import { usePullRequests } from '#/hooks/use-pull-requests.js'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  const { isPending, error, data } = usePullRequests()
  if (isPending || error) return null
  return <Dashboard data={data} />
}

import { createFileRoute } from '@tanstack/react-router'
import { usePullRequests } from '#/hooks/use-pull-requests.js'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  const { isPending, error, data } = usePullRequests()
  return (
    <main>
      <h1>prq</h1>
      {isPending
        ? <p>loading…</p>
        : error
          ? <pre>error: {error.message}</pre>
          : <pre>{JSON.stringify(data, null, 2)}</pre>}
    </main>
  )
}

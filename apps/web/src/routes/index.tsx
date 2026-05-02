import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  return (
    <main>
      <h1>prq</h1>
      <p>prq is a platform for creating and managing your projects.</p>
    </main>
  )
}

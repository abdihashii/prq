import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { formatRelativeTime } from '@/lib/format/format'

interface LastSyncedProps {
  githubSyncedAt: string | null
  isFetching: boolean
}

export function LastSynced({ githubSyncedAt, isFetching }: LastSyncedProps) {
  const [, setTick] = useState(0)

  useEffect(() => {
    if (isFetching) return
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [isFetching])

  if (githubSyncedAt === null) {
    return (
      <div className="text-muted-foreground flex items-center text-xs">
        <Loader2 className="size-3 animate-spin" aria-label="Loading" />
      </div>
    )
  }

  const parts = formatRelativeTime(githubSyncedAt)

  return (
    <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
      <span className="tabular-nums">
        Last synced:{' '}
        <span className="inline-block min-w-[2ch] text-right">{parts.digits}</span>
        {parts.unit}
      </span>
      {isFetching && <Loader2 className="size-3 animate-spin" aria-label="Refreshing" />}
    </div>
  )
}

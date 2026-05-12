import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { formatRelativeTime } from '#/lib/format-relative-time/format-relative-time.js'

interface LastSyncedProps {
  dataUpdatedAt: number
  isFetching: boolean
}

export function LastSynced({ dataUpdatedAt, isFetching }: LastSyncedProps) {
  const [, setTick] = useState(0)

  useEffect(() => {
    if (isFetching) return
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [isFetching])

  const label =
    dataUpdatedAt === 0
      ? 'Last synced: —'
      : `Last synced: ${formatRelativeTime(new Date(dataUpdatedAt).toISOString())}`

  return (
    <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
      <span className="tabular-nums">{label}</span>
      {isFetching && <Loader2 className="size-3 animate-spin" aria-label="Refreshing" />}
    </div>
  )
}

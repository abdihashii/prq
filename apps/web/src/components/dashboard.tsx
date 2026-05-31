import type { BucketedResponse } from '@prq/shared'
import { DISPLAY_ORDER } from '@prq/shared'
import { BucketSection } from '@/components/bucket-section'
import type { DashboardDisplayBuckets } from '@/lib/dashboard-display/dashboard-display'
import { toPrDisplayItems } from '@/lib/dashboard-display/dashboard-display'

interface DashboardProps {
  data: BucketedResponse
  displayBuckets?: Partial<DashboardDisplayBuckets>
}

export function Dashboard({ data, displayBuckets }: DashboardProps) {
  const buckets = DISPLAY_ORDER.reduce((acc, bucket) => {
    acc[bucket] = displayBuckets?.[bucket] ?? toPrDisplayItems(data.buckets[bucket])
    return acc
  }, {} as DashboardDisplayBuckets)
  const isAllEmpty = DISPLAY_ORDER.every((bucket) => buckets[bucket].length === 0)
  if (isAllEmpty) {
    return (
      <p className="text-muted-foreground py-12 text-center">
        Nothing in flight. Go ship something.
      </p>
    )
  }
  return (
    <div className="space-y-4">
      {DISPLAY_ORDER.map((bucket) => (
        <BucketSection key={bucket} bucket={bucket} items={buckets[bucket]} />
      ))}
    </div>
  )
}

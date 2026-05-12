import type { BucketedResponse } from '@prq/shared'
import { DISPLAY_ORDER } from '@prq/shared'
import { BucketSection } from '@/components/bucket-section'

interface DashboardProps {
  data: BucketedResponse
}

export function Dashboard({ data }: DashboardProps) {
  const isAllEmpty = DISPLAY_ORDER.every((bucket) => data.buckets[bucket].length === 0)
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
        <BucketSection key={bucket} bucket={bucket} prs={data.buckets[bucket]} />
      ))}
    </div>
  )
}

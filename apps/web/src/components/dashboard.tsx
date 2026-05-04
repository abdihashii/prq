import type { BucketedResponse } from '@prq/shared'
import { DISPLAY_ORDER } from '@prq/shared'
import { BucketSection } from '#/components/bucket-section.js'

interface DashboardProps {
  data: BucketedResponse
}

export function Dashboard({ data }: DashboardProps) {
  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-4 text-2xl font-semibold">prq</h1>
      <div className="space-y-4">
        {DISPLAY_ORDER.map((bucket) => (
          <BucketSection key={bucket} bucket={bucket} prs={data.buckets[bucket]} />
        ))}
      </div>
    </main>
  )
}

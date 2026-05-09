import { DISPLAY_ORDER } from '@prq/shared'
import { Fragment } from 'react'
import { Card, CardContent, CardHeader } from '#/components/ui/card.js'
import { Separator } from '#/components/ui/separator.js'
import { Skeleton } from '#/components/ui/skeleton.js'
import { BUCKET_DISPLAY } from '#/lib/bucket-display.js'
import { cn } from '#/lib/utils.js'

const SKELETON_ROWS_PER_BUCKET = 2

export function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      {DISPLAY_ORDER.map((bucket) => {
        const { label, Icon, accentClass } = BUCKET_DISPLAY[bucket]
        return (
          <Card key={bucket}>
            <CardHeader className="flex flex-row items-center gap-2 py-3">
              <Icon className={cn('size-5 shrink-0', accentClass)} />
              <span className="font-semibold">{label}</span>
              <span className="text-muted-foreground">(—)</span>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-0">
              {Array.from({ length: SKELETON_ROWS_PER_BUCKET }).map((_, i) => (
                <Fragment key={i}>
                  {i > 0 && <Separator className="my-2" />}
                  <SkeletonRow />
                </Fragment>
              ))}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 py-2">
      <Skeleton className="size-4 rounded-full" />
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-4 flex-1" />
    </div>
  )
}

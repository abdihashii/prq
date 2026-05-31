import type { Bucket, PullRequest } from '@prq/shared'
import { Info } from 'lucide-react'
import { Fragment } from 'react'
import { PrRow } from '@/components/pr-row'
import { PrStack } from '@/components/pr-stack'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { BUCKET_DISPLAY } from '@/lib/bucket-display'
import type { DashboardDisplayItem } from '@/lib/dashboard-display/dashboard-display'
import {
  countDisplayItemPrs,
  toPrDisplayItems,
} from '@/lib/dashboard-display/dashboard-display'
import { formatNumber } from '@/lib/format/format'
import { cn } from '@/lib/utils'

interface BucketSectionProps {
  bucket: Bucket
  prs?: PullRequest[]
  items?: DashboardDisplayItem[]
}

export function BucketSection({ bucket, prs = [], items }: BucketSectionProps) {
  const { label, Icon, accentClass, description } = BUCKET_DISPLAY[bucket]
  const displayItems = items ?? toPrDisplayItems(prs)
  const count = displayItems.reduce((sum, item) => sum + countDisplayItemPrs(item), 0)
  const isEmpty = displayItems.length === 0
  return (
    <Card className={cn(isEmpty && 'opacity-60')}>
      <CardHeader className="flex flex-row items-center gap-2 py-3">
        <Icon className={cn('size-5 shrink-0', accentClass, isEmpty && 'opacity-70')} />
        <span className={cn('font-semibold', isEmpty && 'text-muted-foreground font-medium')}>
          {label}
        </span>
        <span className="font-mono text-foreground-secondary tabular-nums">({formatNumber(count)})</span>
        <Tooltip>
          <TooltipTrigger
            aria-label={`About ${label}`}
            className="ml-1 rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <Info className="size-3.5" />
          </TooltipTrigger>
          <TooltipContent side="right" className="max-w-xs">
            {description}
          </TooltipContent>
        </Tooltip>
      </CardHeader>
      {!isEmpty && (
        <CardContent className="px-3 pb-3 pt-0">
          {displayItems.map((item, i) => (
            <Fragment key={getDisplayItemKey(item)}>
              {i > 0 && <Separator className="my-2" />}
              {item.kind === 'pr'
                ? <PrRow pr={item.pr} bucket={bucket} />
                : <PrStack root={item.root} bucket={bucket} />}
            </Fragment>
          ))}
        </CardContent>
      )}
    </Card>
  )
}

function getDisplayItemKey(item: DashboardDisplayItem): string {
  if (item.kind === 'pr') return item.pr.id
  return item.root.pr.id
}

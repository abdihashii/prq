import type { Bucket, PullRequest } from '@prq/shared'
import { Info } from 'lucide-react'
import { Fragment } from 'react'
import { PrRow } from '@/components/pr-row'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { BUCKET_DISPLAY } from '@/lib/bucket-display'
import { formatNumber } from '@/lib/format/format'
import { cn } from '@/lib/utils'

interface BucketSectionProps {
  bucket: Bucket
  prs: PullRequest[]
}

export function BucketSection({ bucket, prs }: BucketSectionProps) {
  const { label, Icon, accentClass, description } = BUCKET_DISPLAY[bucket]
  const isEmpty = prs.length === 0
  return (
    <Card className={cn(isEmpty && 'opacity-60')}>
      <CardHeader className="flex flex-row items-center gap-2 py-3">
        <Icon className={cn('size-5 shrink-0', accentClass, isEmpty && 'opacity-70')} />
        <span className={cn('font-semibold', isEmpty && 'text-muted-foreground font-medium')}>
          {label}
        </span>
        <span className="font-mono text-foreground-secondary tabular-nums">({formatNumber(prs.length)})</span>
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
          {prs.map((pr, i) => (
            <Fragment key={pr.id}>
              {i > 0 && <Separator className="my-2" />}
              <PrRow pr={pr} bucket={bucket} />
            </Fragment>
          ))}
        </CardContent>
      )}
    </Card>
  )
}

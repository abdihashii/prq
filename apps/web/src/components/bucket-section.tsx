import type { Bucket, PullRequest } from '@prq/shared'
import { Info } from 'lucide-react'
import { Fragment } from 'react'
import { PrRow } from '#/components/pr-row.js'
import { Card, CardContent, CardHeader } from '#/components/ui/card.js'
import { Separator } from '#/components/ui/separator.js'
import { Tooltip, TooltipContent, TooltipTrigger } from '#/components/ui/tooltip.js'
import { BUCKET_DISPLAY } from '#/lib/bucket-display.js'
import { cn } from '#/lib/utils.js'

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
        <span className="text-muted-foreground">({prs.length})</span>
        <Tooltip>
          <TooltipTrigger
            aria-label={`About ${label}`}
            className="ml-1 text-muted-foreground transition-colors hover:text-foreground"
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

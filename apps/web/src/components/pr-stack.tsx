import type { Bucket } from '@prq/shared'
import { PrRow } from '@/components/pr-row'
import type { StackNode } from '@/lib/dashboard-display/dashboard-display'
import { cn } from '@/lib/utils'

interface PrStackProps {
  root: StackNode
  bucket: Bucket
}

export function PrStack({ root, bucket }: PrStackProps) {
  return (
    <div className="rounded-md bg-muted/35 p-1">
      <StackNodeView node={root} bucket={bucket} depth={0} />
    </div>
  )
}

interface StackNodeViewProps {
  node: StackNode
  bucket: Bucket
  depth: number
}

function StackNodeView({ node, bucket, depth }: StackNodeViewProps) {
  const children = node.children ?? []

  return (
    <div>
      <PrRow
        pr={node.pr}
        bucket={bucket}
        autoRetargetedFromBaseRefName={node.autoRetarget?.previousBaseRefName}
      />
      {children.length > 0 && (
        <div
          className={cn(
            'mt-1 space-y-1 border-l border-border pl-3',
            depth === 0 ? 'ml-4 sm:ml-6 sm:pl-4' : 'ml-3 sm:ml-5',
          )}
        >
          {children.map((child) => (
            <div key={child.pr.id} className="relative">
              <span
                aria-hidden="true"
                className="absolute -left-3 top-5 h-px w-3 bg-border sm:-left-4 sm:w-4"
              />
              <StackNodeView node={child} bucket={bucket} depth={depth + 1} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

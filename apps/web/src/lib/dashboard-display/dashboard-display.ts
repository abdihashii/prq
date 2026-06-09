import type { Bucket, PullRequest } from '@prq/shared'

export interface StackNode {
  pr: PullRequest
  children?: StackNode[]
}

export type DashboardDisplayItem =
  | { kind: 'pr', pr: PullRequest }
  | { kind: 'stack', root: StackNode }

export type DashboardDisplayBuckets = Record<Bucket, DashboardDisplayItem[]>

export function toPrDisplayItems(prs: PullRequest[]): DashboardDisplayItem[] {
  return prs.map((pr) => ({ kind: 'pr', pr }))
}

export function countDisplayItemPrs(item: DashboardDisplayItem): number {
  if (item.kind === 'pr') return 1
  return countStackNodePrs(item.root)
}

export function flattenDisplayItems(items: DashboardDisplayItem[]): PullRequest[] {
  return items.flatMap((item) => {
    if (item.kind === 'pr') return [item.pr]
    return flattenStackNode(item.root)
  })
}

function countStackNodePrs(node: StackNode): number {
  return 1 + (node.children ?? []).reduce((sum, child) => sum + countStackNodePrs(child), 0)
}

function flattenStackNode(node: StackNode): PullRequest[] {
  return [
    node.pr,
    ...(node.children ?? []).flatMap((child) => flattenStackNode(child)),
  ]
}

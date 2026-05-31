import type { Bucket } from '../types/bucket'
import type { DashboardBuckets, DashboardItem, StackNode } from '../types/dashboard'
import type { PullRequest } from '../types/pullRequest'

export function inferDashboardStacks(buckets: Record<Bucket, PullRequest[]>): DashboardBuckets {
  return {
    review: inferBucketStacks(buckets.review),
    attention: inferBucketStacks(buckets.attention),
    ready: inferBucketStacks(buckets.ready),
    waiting: inferBucketStacks(buckets.waiting),
    drafts: inferBucketStacks(buckets.drafts),
  }
}

interface MutableStackNode {
  pr: PullRequest
  children: MutableStackNode[]
}

function inferBucketStacks(prs: PullRequest[]): DashboardItem[] {
  const nodesById = new Map<string, MutableStackNode>()
  const parentCandidatesByHeadRef = new Map<string, string[]>()

  for (const pr of prs) {
    nodesById.set(pr.id, { pr, children: [] })

    const key = branchKey(pr, pr.headRefName)
    const candidates = parentCandidatesByHeadRef.get(key) ?? []
    candidates.push(pr.id)
    parentCandidatesByHeadRef.set(key, candidates)
  }

  const parentByChild = new Map<string, string>()
  for (const pr of prs) {
    const candidates = parentCandidatesByHeadRef
      .get(branchKey(pr, pr.baseRefName))
      ?.filter(candidateId => candidateId !== pr.id) ?? []

    if (candidates.length === 1) parentByChild.set(pr.id, candidates[0]!)
  }

  const safeParentByChild = removeCyclicLinks(parentByChild)

  for (const pr of prs) {
    const parentId = safeParentByChild.get(pr.id)
    if (parentId === undefined) continue

    const parent = nodesById.get(parentId)
    const child = nodesById.get(pr.id)
    if (parent === undefined || child === undefined) continue

    parent.children.push(child)
  }

  const items: DashboardItem[] = []

  for (const pr of prs) {
    if (safeParentByChild.has(pr.id)) continue
    const node = nodesById.get(pr.id)
    if (node === undefined) continue

    if (node.children.length === 0) items.push({ kind: 'pr', pr })
    else items.push({ kind: 'stack', root: toStackNode(node) })
  }

  return items
}

function removeCyclicLinks(parentByChild: Map<string, string>): Map<string, string> {
  const safeParentByChild = new Map(parentByChild)

  for (const childId of parentByChild.keys()) {
    if (hasCycle(childId, parentByChild)) safeParentByChild.delete(childId)
  }

  return safeParentByChild
}

function hasCycle(childId: string, parentByChild: Map<string, string>): boolean {
  const seen = new Set<string>([childId])
  let parentId = parentByChild.get(childId)

  while (parentId !== undefined) {
    if (seen.has(parentId)) return true
    seen.add(parentId)
    parentId = parentByChild.get(parentId)
  }

  return false
}

function toStackNode(node: MutableStackNode): StackNode {
  return {
    pr: node.pr,
    children: node.children.map(toStackNode),
  }
}

function branchKey(pr: Pick<PullRequest, 'repository'>, refName: string): string {
  return JSON.stringify([pr.repository.owner, pr.repository.name, refName])
}

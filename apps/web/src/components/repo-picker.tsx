import type { TrackableRepo, TrackedRepos } from '@prq/shared'
import { useVirtualizer } from '@tanstack/react-virtual'
import { X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'

interface RepoPickerProps {
  trackableRepos: TrackableRepo[]
  draftTrackedRepos: TrackedRepos
  onChange: (next: TrackedRepos) => void
  loading?: boolean
}

const ROW_HEIGHT = 36
const SKELETON_ROW_COUNT = 6

export function RepoPicker(props: RepoPickerProps) {
  // Skeleton is its own component so the active picker's hooks don't run
  // during loading — keeps the rules-of-hooks invariant when `loading`
  // toggles (unmount vs. re-render).
  if (props.loading) return <RepoPickerSkeleton />
  return <RepoPickerActive {...props} />
}

function RepoPickerSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-9 w-full" />
      <div className="border-input rounded-md border p-1">
        {Array.from({ length: SKELETON_ROW_COUNT }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-2 px-2"
            style={{ height: ROW_HEIGHT }}
          >
            <Skeleton className="size-4 rounded-sm" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-6" />
          </div>
        ))}
      </div>
    </div>
  )
}

function RepoPickerActive({
  trackableRepos,
  draftTrackedRepos,
  onChange,
}: RepoPickerProps) {
  const [searchQuery, setSearchQuery] = useState('')

  const draft = useMemo(() => new Set(draftTrackedRepos), [draftTrackedRepos])

  const allRepos = useMemo<TrackableRepo[]>(() => {
    const map = new Map<string, TrackableRepo>()
    for (const r of trackableRepos) {
      map.set(`${r.owner}/${r.name}`, r)
    }
    for (const slug of draftTrackedRepos) {
      if (map.has(slug)) continue
      const [owner, name] = slug.split('/')
      map.set(slug, { owner, name, prCount: 0 })
    }
    return Array.from(map.values()).sort((a, b) => {
      const ak = `${a.owner}/${a.name}`
      const bk = `${b.owner}/${b.name}`
      return ak < bk ? -1 : ak > bk ? 1 : 0
    })
  }, [trackableRepos, draftTrackedRepos])

  const visibleRepos = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return allRepos
    return allRepos.filter(r => `${r.owner}/${r.name}`.toLowerCase().includes(q))
  }, [allRepos, searchQuery])

  const parentRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: visibleRepos.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
  })

  const toggle = (key: string) => {
    const next = new Set(draft)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    onChange(allRepos.map(r => `${r.owner}/${r.name}`).filter(k => next.has(k)))
  }

  const selectedSlugs = useMemo(
    () =>
      allRepos
        .map(r => `${r.owner}/${r.name}`)
        .filter(k => draft.has(k)),
    [allRepos, draft],
  )

  if (allRepos.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No repositories yet — none owned and none currently in your PR firehose.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {selectedSlugs.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedSlugs.map(slug => (
            <Badge
              key={slug}
              variant="secondary"
              asChild
              className="cursor-pointer gap-1 py-1 hover:bg-secondary/80"
            >
              <button
                type="button"
                onClick={() => toggle(slug)}
                aria-label={`Remove ${slug}`}
              >
                <span className="max-w-[24ch] truncate">{slug}</span>
                <X className="size-3 shrink-0" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <Input
        placeholder="Search repos..."
        value={searchQuery}
        onChange={e => setSearchQuery(e.target.value)}
      />

      <div
        ref={parentRef}
        className="border-input max-h-[40vh] overflow-auto rounded-md border"
      >
        {visibleRepos.length === 0 ? (
          <p className="text-muted-foreground p-3 text-sm">
            No repos match your search.
          </p>
        ) : (
          <div
            style={{
              height: virtualizer.getTotalSize(),
              position: 'relative',
              width: '100%',
            }}
          >
            {virtualizer.getVirtualItems().map((vItem) => {
              const repo = visibleRepos[vItem.index]
              const key = `${repo.owner}/${repo.name}`
              const id = `repo-${key}`
              return (
                <div
                  key={key}
                  className="hover:bg-accent/30 flex items-center gap-2 px-3"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${vItem.size}px`,
                    transform: `translateY(${vItem.start}px)`,
                  }}
                >
                  <Checkbox
                    id={id}
                    checked={draft.has(key)}
                    onCheckedChange={() => toggle(key)}
                  />
                  <Label
                    htmlFor={id}
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 font-normal"
                  >
                    <span className="min-w-0 flex-1 truncate">{key}</span>
                    <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                      {repo.prCount}
                    </span>
                  </Label>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

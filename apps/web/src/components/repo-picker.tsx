import type { TrackableRepo, TrackingState } from '@prq/shared'
import { useVirtualizer } from '@tanstack/react-virtual'
import { X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { clearRepos, setMode, toggleRepo, TRACKING_ALL_THRESHOLD } from '@/lib/tracking/tracking'

interface RepoPickerProps {
  trackableRepos: TrackableRepo[]
  draftTracking: TrackingState
  onChange: (next: TrackingState) => void
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

function ModeToggle({
  mode,
  onSelect,
}: {
  mode: TrackingState['mode']
  onSelect: (mode: 'all' | 'custom') => void
}) {
  return (
    <div className="flex gap-1">
      <Button
        type="button"
        size="sm"
        variant={mode === 'all' ? 'default' : 'outline'}
        onClick={() => onSelect('all')}
      >
        All
      </Button>
      <Button
        type="button"
        size="sm"
        variant={mode === 'custom' ? 'default' : 'outline'}
        onClick={() => onSelect('custom')}
      >
        Select
      </Button>
    </div>
  )
}

function RepoPickerActive({
  trackableRepos,
  draftTracking,
  onChange,
}: RepoPickerProps) {
  const handleModeSelect = (mode: 'all' | 'custom') => {
    onChange(setMode(draftTracking, mode, trackableRepos))
  }

  if (draftTracking.mode === 'all') {
    return (
      <div className="space-y-3">
        <ModeToggle mode="all" onSelect={handleModeSelect} />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <ModeToggle mode="custom" onSelect={handleModeSelect} />
      <CustomChecklist
        trackableRepos={trackableRepos}
        repos={draftTracking.repos}
        onToggle={slug => onChange(toggleRepo(draftTracking, slug))}
        onClear={() => onChange(clearRepos(draftTracking))}
      />
    </div>
  )
}

function CustomChecklist({
  trackableRepos,
  repos,
  onToggle,
  onClear,
}: {
  trackableRepos: TrackableRepo[]
  repos: string[]
  onToggle: (slug: string) => void
  onClear: () => void
}) {
  const [searchQuery, setSearchQuery] = useState('')

  const draft = useMemo(() => new Set(repos), [repos])

  const allRepos = useMemo<TrackableRepo[]>(() => {
    const map = new Map<string, TrackableRepo>()
    for (const r of trackableRepos) {
      map.set(`${r.owner}/${r.name}`, r)
    }
    for (const slug of repos) {
      if (map.has(slug)) continue
      const [owner, name] = slug.split('/')
      map.set(slug, { owner, name, prCount: 0 })
    }
    return Array.from(map.values()).sort((a, b) => {
      const ak = `${a.owner}/${a.name}`
      const bk = `${b.owner}/${b.name}`
      return ak < bk ? -1 : ak > bk ? 1 : 0
    })
  }, [trackableRepos, repos])

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
        No repositories yet. None owned and none currently in your PR firehose.
      </p>
    )
  }

  const showSearch = allRepos.length > TRACKING_ALL_THRESHOLD

  return (
    <div className="space-y-3">
      {selectedSlugs.length > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-xs tabular-nums">
            {selectedSlugs.length} tracked
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={onClear}>
            Clear all
          </Button>
        </div>
      )}

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
                onClick={() => onToggle(slug)}
                aria-label={`Remove ${slug}`}
              >
                <span className="max-w-[24ch] truncate">{slug}</span>
                <X className="size-3 shrink-0" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {showSearch && (
        <Input
          placeholder="Search repos..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
      )}

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
                    onCheckedChange={() => onToggle(key)}
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

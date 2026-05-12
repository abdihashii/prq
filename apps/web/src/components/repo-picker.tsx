import type { TrackableRepo, TrackedRepos } from '@prq/shared'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface RepoPickerProps {
  trackableRepos: TrackableRepo[]
  trackedRepos: TrackedRepos
  onSave: (next: TrackedRepos) => void
}

const ROW_HEIGHT = 36

export function RepoPicker({ trackableRepos, trackedRepos, onSave }: RepoPickerProps) {
  const [draft, setDraft] = useState<Set<string>>(() => new Set(trackedRepos))
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    setDraft(new Set(trackedRepos))
  }, [trackedRepos])

  const allRepos = useMemo<TrackableRepo[]>(() => {
    const map = new Map<string, TrackableRepo>()
    for (const r of trackableRepos) {
      map.set(`${r.owner}/${r.name}`, r)
    }
    for (const slug of trackedRepos) {
      if (map.has(slug)) continue
      const [owner, name] = slug.split('/')
      map.set(slug, { owner, name, prCount: 0 })
    }
    return Array.from(map.values()).sort((a, b) => {
      const ak = `${a.owner}/${a.name}`
      const bk = `${b.owner}/${b.name}`
      return ak < bk ? -1 : ak > bk ? 1 : 0
    })
  }, [trackableRepos, trackedRepos])

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

  const isDirty
    = draft.size !== trackedRepos.length
      || trackedRepos.some(r => !draft.has(r))

  const toggle = (key: string) => {
    setDraft((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleSave = () => {
    const ordered = allRepos
      .map(r => `${r.owner}/${r.name}`)
      .filter(k => draft.has(k))
    onSave(ordered)
  }

  if (allRepos.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No repositories yet — none owned and none currently in your PR firehose.
      </p>
    )
  }

  return (
    <div className="space-y-3">
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

      <Button onClick={handleSave} disabled={!isDirty} size="sm">
        Save
      </Button>
    </div>
  )
}

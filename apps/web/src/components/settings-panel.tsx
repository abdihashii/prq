import type { PollingMs, TrackableRepo, TrackedRepos } from '@prq/shared'
import { POLLING_OPTIONS } from '@prq/shared'
import { useEffect, useMemo, useState } from 'react'
import { RepoPicker } from '@/components/repo-picker'
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useIsMobile } from '@/hooks/use-mobile'

interface SettingsPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  pollingMs: PollingMs
  trackedRepos: TrackedRepos
  trackableRepos: TrackableRepo[]
  onPollingMsChange: (ms: PollingMs) => void
  onTrackedReposChange: (repos: TrackedRepos) => void
}

export function SettingsPanel(props: SettingsPanelProps) {
  const {
    open,
    onOpenChange,
    pollingMs,
    trackedRepos,
    trackableRepos,
    onPollingMsChange,
    onTrackedReposChange,
  } = props
  const isMobile = useIsMobile()

  const [draftPollingMs, setDraftPollingMs] = useState<PollingMs>(pollingMs)
  const [draftTrackedRepos, setDraftTrackedRepos] = useState<TrackedRepos>(trackedRepos)

  useEffect(() => {
    setDraftPollingMs(pollingMs)
  }, [pollingMs])

  useEffect(() => {
    setDraftTrackedRepos(trackedRepos)
  }, [trackedRepos])

  // Reset drafts to persisted state whenever the panel is opened, so closing
  // without Save and reopening doesn't show stale edits.
  useEffect(() => {
    if (open) {
      setDraftPollingMs(pollingMs)
      setDraftTrackedRepos(trackedRepos)
    }
  }, [open, pollingMs, trackedRepos])

  const trackedReposChanged = useMemo(() => {
    if (draftTrackedRepos.length !== trackedRepos.length) return true
    const persisted = new Set(trackedRepos)
    return draftTrackedRepos.some(r => !persisted.has(r))
  }, [draftTrackedRepos, trackedRepos])

  const isDirty = draftPollingMs !== pollingMs || trackedReposChanged

  const handleSave = () => {
    if (draftPollingMs !== pollingMs) onPollingMsChange(draftPollingMs)
    if (trackedReposChanged) onTrackedReposChange(draftTrackedRepos)
  }

  const body = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 space-y-6 overflow-y-auto p-4">
        <section className="space-y-2">
          <Label htmlFor="polling-select">Polling cadence</Label>
          <Select
            value={String(draftPollingMs)}
            onValueChange={v => setDraftPollingMs(Number(v) as PollingMs)}
          >
            <SelectTrigger id="polling-select" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {POLLING_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={String(opt.value)}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </section>

        <Separator />

        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-medium">Tracked repositories</h3>
            <p className="text-muted-foreground text-xs">
              Show only PRs from selected repos. Selecting nothing hides the dashboard.
            </p>
          </div>
          <RepoPicker
            trackableRepos={trackableRepos}
            draftTrackedRepos={draftTrackedRepos}
            onChange={setDraftTrackedRepos}
          />
        </section>
      </div>

      <div className="border-t p-4">
        <Button onClick={handleSave} disabled={!isDirty} size="sm" className="w-full sm:w-auto">
          Save
        </Button>
      </div>
    </div>
  )

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Settings</DrawerTitle>
            <DrawerDescription>Configure prq.</DrawerDescription>
          </DrawerHeader>
          {body}
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Settings</SheetTitle>
          <SheetDescription>Configure prq.</SheetDescription>
        </SheetHeader>
        {body}
      </SheetContent>
    </Sheet>
  )
}

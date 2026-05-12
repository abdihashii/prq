import type { PollingMs, TrackableRepo, TrackedRepos } from '@prq/shared'
import { POLLING_OPTIONS } from '@prq/shared'
import { RepoPicker } from '@/components/repo-picker'
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

  const body = (
    <div className="space-y-6 p-4">
      <section className="space-y-2">
        <Label htmlFor="polling-select">Polling cadence</Label>
        <Select
          value={String(pollingMs)}
          onValueChange={v => onPollingMsChange(Number(v) as PollingMs)}
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
          trackedRepos={trackedRepos}
          onSave={onTrackedReposChange}
        />
      </section>
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

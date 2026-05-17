import type { PollingMs, Settings, Theme, TrackableRepo, TrackedRepos } from '@prq/shared'
import { POLLING_OPTIONS, SettingsSchema } from '@prq/shared'
import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { AuthSection } from '@/components/auth-section'
import { RepoPicker } from '@/components/repo-picker'
import { ThemeToggle } from '@/components/theme-toggle'
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
  trackableReposLoading: boolean
  resolvedTheme: Theme
  onPollingMsChange: (ms: PollingMs) => void
  onTrackedReposChange: (repos: TrackedRepos) => void
  onThemeChange: (theme: Theme) => void
  onAuthChange: (signedIn: boolean) => void
  signedOut: boolean
}

export function SettingsPanel(props: SettingsPanelProps) {
  const {
    open,
    onOpenChange,
    pollingMs,
    trackedRepos,
    trackableRepos,
    trackableReposLoading,
    resolvedTheme,
    onPollingMsChange,
    onTrackedReposChange,
    onThemeChange,
    onAuthChange,
    signedOut,
  } = props
  const isMobile = useIsMobile()

  const form = useForm<Settings>({
    resolver: zodResolver(SettingsSchema),
    defaultValues: { pollingMs, trackedRepos },
  })

  // Reset drafts to persisted state whenever the panel is opened, so closing
  // without Save and reopening doesn't show stale edits. Mirrors the Phase 6B
  // "discard on close, hydrate on open" semantic; intentionally NOT a generic
  // mirror of external state — that would silently revert an in-flight edit.
  useEffect(() => {
    if (open) form.reset({ pollingMs, trackedRepos })
  }, [open, pollingMs, trackedRepos, form])

  const handleSave = form.handleSubmit((values) => {
    onPollingMsChange(values.pollingMs)
    onTrackedReposChange(values.trackedRepos)
    // Rebaseline so isDirty flips back to false; the parent prop update
    // doesn't reset RHF's defaultValues on its own.
    form.reset(values)
  })

  const body = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 space-y-6 overflow-y-auto p-4">
        <AuthSection onAuthChange={onAuthChange} signedOut={signedOut} />

        <Separator />

        <section className="flex items-center justify-between">
          <Label>Theme</Label>
          <ThemeToggle resolvedTheme={resolvedTheme} onChange={onThemeChange} />
        </section>

        <Separator />

        <section className="space-y-2">
          <Label htmlFor="polling-select">Polling cadence</Label>
          <Controller
            name="pollingMs"
            control={form.control}
            render={({ field }) => (
              <Select
                value={String(field.value)}
                onValueChange={v => field.onChange(Number(v))}
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
            )}
          />
        </section>

        <Separator />

        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-medium">Tracked repositories</h3>
            <p className="text-muted-foreground text-xs">
              Show only PRs from selected repos. Selecting nothing hides the dashboard.
            </p>
          </div>
          <Controller
            name="trackedRepos"
            control={form.control}
            render={({ field }) => (
              <RepoPicker
                trackableRepos={trackableRepos}
                draftTrackedRepos={field.value}
                onChange={field.onChange}
                loading={trackableReposLoading}
              />
            )}
          />
        </section>
      </div>

      <div className="border-t p-4">
        <Button
          onClick={handleSave}
          disabled={!form.formState.isDirty}
          size="sm"
          className="w-full sm:w-auto"
        >
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


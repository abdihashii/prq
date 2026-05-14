import type { PatSubmit, PollingMs, Settings, Theme, TrackableRepo, TrackedRepos } from '@prq/shared'
import { PatSubmitSchema, POLLING_OPTIONS, SettingsSchema } from '@prq/shared'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Loader2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
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
import { Input } from '@/components/ui/input'
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
import { useTokenHealth } from '@/hooks/use-token-health'
import { ApiError } from '@/lib/api-error'
import { deletePat, submitPat } from '@/queries/pat'

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
        <PatSection onAuthChange={onAuthChange} signedOut={signedOut} />

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

function PatSection({
  onAuthChange,
  signedOut,
}: {
  onAuthChange: (signedIn: boolean) => void
  signedOut: boolean
}) {
  const queryClient = useQueryClient()
  const tokenHealth = useTokenHealth({ enabled: !signedOut })
  const [revealed, setRevealed] = useState(false)

  const patForm = useForm<PatSubmit>({
    resolver: zodResolver(PatSubmitSchema),
    defaultValues: { pat: '' },
  })

  const submit = useMutation({
    mutationFn: submitPat,
    onSuccess: () => {
      // onAuthChange(true) clears viewer-derived state in the parent and
      // un-gates the queries so the refetch can fire. Flips happen
      // synchronously *before* removeQueries so the form drops the prior
      // viewer's selections before the refetch round-trips.
      onAuthChange(true)
      // removeQueries (not invalidateQueries): clears the cache entirely so
      // the prior viewer's preserved `data` can't leak across an account
      // swap during the refetch window. Active observers (useTokenHealth,
      // usePullRequests) refetch automatically from a clean state.
      queryClient.removeQueries({ queryKey: ['token-health'] })
      queryClient.removeQueries({ queryKey: ['prs'] })
      patForm.reset({ pat: '' })
      setRevealed(false)
    },
    onError: () => {
      patForm.reset({ pat: '' })
    },
  })

  const signOut = useMutation({
    mutationFn: deletePat,
    onSuccess: () => {
      // onAuthChange(false) flips the parent's signedOut flag → queries are
      // disabled → no wasted /prs + /user round-trip that we already know
      // will 401. PatErrorPage shows immediately via the signedOut branch
      // of fatalAuthError.
      onAuthChange(false)
      queryClient.removeQueries({ queryKey: ['token-health'] })
      queryClient.removeQueries({ queryKey: ['prs'] })
    },
  })

  // Use isSuccess (not data !== undefined) — TanStack preserves the last
  // successful `data` after a subsequent refetch error, so checking `data`
  // would keep showing "Signed in as @old" forever after sign-out.
  const isSignedIn = tokenHealth.isSuccess

  const handlePatSubmit = patForm.handleSubmit((values) => {
    submit.mutate(values.pat)
  })

  const handleCancel = () => {
    patForm.reset({ pat: '' })
    setRevealed(false)
    submit.reset()
  }

  if (revealed) {
    return (
      <section className="space-y-3">
        <form onSubmit={handlePatSubmit} className="space-y-2">
          <Input
            type="password"
            autoComplete="off"
            autoFocus
            placeholder="Paste your GitHub PAT"
            {...patForm.register('pat')}
          />
          {submit.isError && (
            <p className="text-destructive text-sm">
              {submit.error instanceof ApiError && submit.error.code === 'BAD_CREDENTIALS'
                ? 'GitHub rejected this token.'
                : 'Something went wrong. Please try again.'}
            </p>
          )}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={submit.isPending}>
              {submit.isPending ? 'Submitting…' : 'Submit'}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={handleCancel}>
              Cancel
            </Button>
          </div>
        </form>
      </section>
    )
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 text-sm">
        {tokenHealth.isLoading ? (
          <>
            <Loader2 className="size-4 shrink-0 animate-spin" />
            <span className="text-muted-foreground">Checking…</span>
          </>
        ) : isSignedIn ? (
          <>
            <Check className="size-4 shrink-0 text-success" aria-hidden />
            <span className="min-w-0 truncate">
              Signed in as{' '}
              <span className="font-mono">@{tokenHealth.data.login}</span>
            </span>
          </>
        ) : (
          <>
            <X className="text-muted-foreground size-4 shrink-0" aria-hidden />
            <span className="text-muted-foreground">Not set</span>
          </>
        )}
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setRevealed(true)}
        >
          Update token
        </Button>
        {isSignedIn && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => signOut.mutate()}
            disabled={signOut.isPending}
          >
            Sign out
          </Button>
        )}
      </div>
    </section>
  )
}

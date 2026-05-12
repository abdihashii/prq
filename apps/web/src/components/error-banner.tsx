import { format } from 'date-fns'
import { AlertCircle, AlertTriangle, RefreshCw, WifiOff } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { ApiError } from '#/lib/api-error'
import { cn } from '#/lib/utils'

interface ErrorBannerProps {
  error: unknown
  onRetry: () => void
}

export function ErrorBanner({ error, onRetry }: ErrorBannerProps) {
  if (error instanceof ApiError && error.code === 'RATE_LIMITED') {
    const label = error.resetAt
      ? `Rate limited. Resuming at ${format(new Date(error.resetAt), 'HH:mm')}.`
      : 'Rate limited. Polling paused.'
    return (
      <Banner kind="warning" icon={AlertTriangle}>
        {label}
      </Banner>
    )
  }

  if (isNetworkLikeError(error)) {
    return (
      <Banner kind="info" icon={WifiOff}>
        Can't reach GitHub. Retrying…
      </Banner>
    )
  }

  const message = error instanceof Error ? error.message : 'Unknown error.'
  return (
    <Banner kind="error" icon={AlertCircle}>
      <span className="flex-1">{message}</span>
      <Button size="sm" variant="outline" onClick={onRetry}>
        <RefreshCw className="size-3.5" />
        Retry
      </Button>
    </Banner>
  )
}

function isNetworkLikeError(error: unknown): boolean {
  if (error instanceof TypeError) return true
  if (error instanceof Error && /^HTTP \d+$/.test(error.message)) return true
  return false
}

const KIND_STYLES = {
  warning:
    'border-amber-500/40 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100',
  info: 'border-border bg-muted/40 text-foreground',
  error: 'border-destructive/40 bg-destructive/10 text-destructive',
} as const

interface BannerProps {
  kind: keyof typeof KIND_STYLES
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}

function Banner({ kind, icon: Icon, children }: BannerProps) {
  return (
    <div
      className={cn(
        'mb-4 flex items-center gap-2 rounded-md border px-3 py-2 text-sm',
        KIND_STYLES[kind],
      )}
    >
      <Icon className="size-4 shrink-0" />
      {children}
    </div>
  )
}

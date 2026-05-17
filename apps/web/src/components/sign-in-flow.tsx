import type { DeviceFlowPollResponse, DeviceFlowStartResponse } from '@prq/shared'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ExternalLink, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api-error'
import { pollDeviceFlow, startDeviceFlow } from '@/queries/auth'

interface SignInFlowProps {
  onSuccess: () => void
}

export function SignInFlow({ onSuccess }: SignInFlowProps) {
  const [flow, setFlow] = useState<DeviceFlowStartResponse | null>(null)
  const [intervalMs, setIntervalMs] = useState(5000)

  const start = useMutation({
    mutationFn: startDeviceFlow,
    onSuccess: (data) => {
      setFlow(data)
      setIntervalMs(data.interval * 1000)
    },
  })

  const poll = useQuery({
    queryKey: ['device-poll', flow?.deviceCode],
    queryFn: () => pollDeviceFlow(flow!.deviceCode),
    enabled: flow !== null,
    retry: false,
    refetchInterval: (q) => {
      const data: DeviceFlowPollResponse | undefined = q.state.data
      if (!data) return intervalMs
      switch (data.status) {
        case 'pending':
          return intervalMs
        case 'slow_down':
          return data.interval * 1000
        default:
          return false
      }
    },
  })

  // slow_down is sticky per the OAuth spec: every subsequent poll uses the
  // bumped interval. Persist the larger value so the refetchInterval callback
  // doesn't reset when the next response comes back as plain pending.
  useEffect(() => {
    if (poll.data?.status === 'slow_down') {
      const nextMs = poll.data.interval * 1000
      if (nextMs > intervalMs) setIntervalMs(nextMs)
    }
  }, [poll.data, intervalMs])

  useEffect(() => {
    if (poll.data?.status === 'success') onSuccess()
  }, [poll.data, onSuccess])

  const restart = () => {
    setFlow(null)
    start.reset()
    start.mutate()
  }

  if (flow === null) {
    return (
      <div className="space-y-3">
        <Button type="button" onClick={() => start.mutate()} disabled={start.isPending}>
          {start.isPending
            ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Starting…
                </>
              )
            : (
                'Sign in with GitHub'
              )}
        </Button>
        {start.isError && (
          <p className="text-destructive text-sm">
            {start.error instanceof ApiError
              ? start.error.message
              : 'Failed to start sign-in. Please try again.'}
          </p>
        )}
      </div>
    )
  }

  const status = poll.data?.status

  if (status === 'expired') {
    return (
      <FlowError
        title="Code expired"
        description="The device code expired before you authorized. Start a new sign-in."
        onRestart={restart}
      />
    )
  }

  if (status === 'denied') {
    return (
      <FlowError
        title="Sign-in cancelled"
        description="You declined the request on GitHub. Try again to grant access."
        onRestart={restart}
      />
    )
  }

  if (poll.isError) {
    return (
      <FlowError
        title="Polling failed"
        description={
          poll.error instanceof ApiError
            ? poll.error.message
            : 'Failed to reach GitHub. Try again.'
        }
        onRestart={restart}
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-muted-foreground text-sm">Enter this code on GitHub:</p>
        <p className="font-mono text-2xl font-semibold tracking-wider">
          {flow.userCode}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild type="button">
          <a
            href={flow.verificationUri}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink className="size-4" />
            Open GitHub
          </a>
        </Button>
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" />
          <span>Waiting for confirmation…</span>
        </div>
      </div>
    </div>
  )
}

function FlowError({
  title,
  description,
  onRestart,
}: {
  title: string
  description: string
  onRestart: () => void
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      <Button type="button" variant="outline" onClick={onRestart}>
        Try again
      </Button>
    </div>
  )
}

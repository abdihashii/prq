import type { Meta, StoryObj } from '@storybook/react-vite'
import { ErrorBanner } from './error-banner'
import { ApiError } from '@/lib/api-error'

const meta: Meta<typeof ErrorBanner> = {
  title: 'Components/ErrorBanner',
  component: ErrorBanner,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Polymorphic feedback banner. Dispatches on the error shape: `ApiError` with `RATE_LIMITED` → warning (amber palette), `TypeError`/`HTTP NNN` → info (neutral), anything else → error (destructive palette with retry button).',
      },
    },
  },
  args: { onRetry: () => {} },
}

export default meta
type Story = StoryObj<typeof ErrorBanner>

export const RateLimitedWithReset: Story = {
  args: {
    error: new ApiError({
      code: 'RATE_LIMITED',
      message: 'GitHub rate limit reached.',
      resetAt: new Date(Date.now() + 8 * 60 * 1000).toISOString(),
    }),
  },
}

export const RateLimitedNoReset: Story = {
  args: {
    error: new ApiError({
      code: 'RATE_LIMITED',
      message: 'GitHub rate limit reached.',
    }),
  },
}

export const NetworkOffline: Story = {
  args: { error: new TypeError('Failed to fetch') },
}

export const NetworkHttp500: Story = {
  args: { error: new Error('HTTP 500') },
}

export const UnknownError: Story = {
  args: { error: new Error('Something unexpected happened while fetching pull requests.') },
}

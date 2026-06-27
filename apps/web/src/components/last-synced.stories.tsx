import type { Meta, StoryObj } from '@storybook/react-vite'
import { LastSynced } from './last-synced'

const meta = {
  title: 'Components/LastSynced',
  component: LastSynced,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Relative "last synced" label that ticks every second, driven by the oldest GitHub reconcile across the viewed repos. Renders a lone spinner before the first sync (githubSyncedAt === null) and an inline spinner while refetching.',
      },
    },
  },
} satisfies Meta<typeof LastSynced>

export default meta
type Story = StoryObj<typeof meta>

export const Fresh: Story = {
  args: {
    githubSyncedAt: new Date(Date.now() - 30_000).toISOString(),
    isFetching: false,
  },
}

export const Stale: Story = {
  args: {
    githubSyncedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    isFetching: false,
  },
}

export const Refreshing: Story = {
  args: {
    githubSyncedAt: new Date(Date.now() - 30_000).toISOString(),
    isFetching: true,
  },
}

export const BeforeFirstSync: Story = {
  args: { githubSyncedAt: null, isFetching: true },
}

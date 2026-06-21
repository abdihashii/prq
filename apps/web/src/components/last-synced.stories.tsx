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
          'Relative "last synced" label that ticks every second. Renders a lone spinner before the first sync (dataUpdatedAt === 0) and an inline spinner while refetching.',
      },
    },
  },
} satisfies Meta<typeof LastSynced>

export default meta
type Story = StoryObj<typeof meta>

export const Fresh: Story = {
  args: { dataUpdatedAt: Date.now() - 30_000, isFetching: false },
}

export const Stale: Story = {
  args: { dataUpdatedAt: Date.now() - 3 * 60 * 60 * 1000, isFetching: false },
}

export const Refreshing: Story = {
  args: { dataUpdatedAt: Date.now() - 30_000, isFetching: true },
}

export const BeforeFirstSync: Story = {
  args: { dataUpdatedAt: 0, isFetching: true },
}

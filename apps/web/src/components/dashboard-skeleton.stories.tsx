import type { Meta, StoryObj } from '@storybook/react-vite'
import { DashboardSkeleton } from './dashboard-skeleton'

const meta = {
  title: 'Components/DashboardSkeleton',
  component: DashboardSkeleton,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Loading placeholder for the dashboard: one card per bucket in display order, each with shimmer rows. Shown while the first PR fetch is in flight.',
      },
    },
  },
} satisfies Meta<typeof DashboardSkeleton>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

import type { Meta, StoryObj } from '@storybook/react-vite'
import { Dashboard } from './dashboard'
import { DashboardSkeleton } from './dashboard-skeleton'
import { LastSynced } from './last-synced'
import {
  BUCKETED_RESPONSE_EMPTY,
  BUCKETED_RESPONSE_MIXED,
  BUCKETED_RESPONSE_POPULATED,
} from '@/lib/pr-fixtures/pr-fixtures'

const meta: Meta<typeof Dashboard> = {
  title: 'Composites/Dashboard',
  component: Dashboard,
  subcomponents: { DashboardSkeleton, LastSynced } as Record<string, React.ComponentType<unknown>>,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Top-level dashboard composite. Renders 5 `BucketSection`s in spec §3 display order (Review → Attention → Ready → Waiting → Drafts). Collapses to "Nothing in flight." when every bucket is empty. The `*WithPageChrome` stories add the route-level wrapper (`<main>` + `<h1>prq</h1>` + `<LastSynced>`) to mirror the actual page.',
      },
    },
  },
}

export default meta
type Story = StoryObj<typeof Dashboard>

export const Populated: Story = {
  args: { data: BUCKETED_RESPONSE_POPULATED },
}

export const Mixed: Story = {
  args: { data: BUCKETED_RESPONSE_MIXED },
}

export const AllEmpty: Story = {
  args: { data: BUCKETED_RESPONSE_EMPTY },
}

export const DashboardWithPageChrome: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => (
    <main className="mx-auto max-w-3xl p-6">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="font-mono text-3xl font-semibold tracking-tight">
          pr<span className="underline decoration-[3px] underline-offset-[6px]">q</span>
        </h1>
        <LastSynced dataUpdatedAt={Date.now() - 30_000} isFetching={false} />
      </header>
      <Dashboard data={BUCKETED_RESPONSE_POPULATED} />
    </main>
  ),
}

export const SkeletonWithPageChrome: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => (
    <main className="mx-auto max-w-3xl p-6">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="font-mono text-3xl font-semibold tracking-tight">
          pr<span className="underline decoration-[3px] underline-offset-[6px]">q</span>
        </h1>
        <LastSynced dataUpdatedAt={0} isFetching />
      </header>
      <DashboardSkeleton />
    </main>
  ),
}

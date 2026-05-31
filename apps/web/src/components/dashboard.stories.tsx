import type { Meta, StoryObj } from '@storybook/react-vite'
import { Dashboard } from './dashboard'
import { DashboardSkeleton } from './dashboard-skeleton'
import { LastSynced } from './last-synced'
import {
  BUCKETED_RESPONSE_AUTO_RETARGET,
  BUCKETED_RESPONSE_DENSE,
  BUCKETED_RESPONSE_EMPTY,
  BUCKETED_RESPONSE_MIXED,
  BUCKETED_RESPONSE_NESTED_STACKS,
  BUCKETED_RESPONSE_POPULATED,
  BUCKETED_RESPONSE_REVIEW_STACKS,
  DISPLAY_BUCKETS_AUTO_RETARGET,
  DISPLAY_BUCKETS_NESTED_STACKS,
  DISPLAY_BUCKETS_REVIEW_STACKS,
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
          'Top-level dashboard composite. Renders 5 `BucketSection`s in spec §3 display order (Review → Attention → Ready → Waiting → Drafts). Collapses to "Nothing in flight." when every bucket is empty. Stack stories pass fixture-only display items so shared API types remain unchanged.',
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

export const DensePrVolume: Story = {
  args: { data: BUCKETED_RESPONSE_DENSE },
}

export const NestedStacks: Story = {
  args: {
    data: BUCKETED_RESPONSE_NESTED_STACKS,
    displayBuckets: DISPLAY_BUCKETS_NESTED_STACKS,
  },
}

export const ReviewStacks: Story = {
  args: {
    data: BUCKETED_RESPONSE_REVIEW_STACKS,
    displayBuckets: DISPLAY_BUCKETS_REVIEW_STACKS,
  },
}

export const AutoRetargetIndicator: Story = {
  args: {
    data: BUCKETED_RESPONSE_AUTO_RETARGET,
    displayBuckets: DISPLAY_BUCKETS_AUTO_RETARGET,
  },
}

export const DashboardWithPageChrome: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => (
    <main className="mx-auto max-w-3xl p-6">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="font-mono text-3xl font-semibold tracking-tight">prq</h1>
        <LastSynced dataUpdatedAt={Date.now() - 30_000} isFetching={false} />
      </header>
      <Dashboard data={BUCKETED_RESPONSE_POPULATED} />
    </main>
  ),
}

export const MobileWidth: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => (
    <main className="mx-auto w-[390px] max-w-full p-3">
      <header className="mb-3 flex items-center justify-between gap-3">
        <h1 className="font-mono text-2xl font-semibold tracking-tight">prq</h1>
        <LastSynced dataUpdatedAt={Date.now() - 30_000} isFetching={false} />
      </header>
      <Dashboard
        data={BUCKETED_RESPONSE_NESTED_STACKS}
        displayBuckets={DISPLAY_BUCKETS_NESTED_STACKS}
      />
    </main>
  ),
}

export const SkeletonWithPageChrome: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => (
    <main className="mx-auto max-w-3xl p-6">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="font-mono text-3xl font-semibold tracking-tight">prq</h1>
        <LastSynced dataUpdatedAt={0} isFetching />
      </header>
      <DashboardSkeleton />
    </main>
  ),
}

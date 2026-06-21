import type { Meta, StoryObj } from '@storybook/react-vite'
import { BucketSection } from './bucket-section'
import { PrRow } from './pr-row'
import {
  ATTENTION_BUCKET,
  DRAFTS_BUCKET,
  DISPLAY_BUCKETS_NESTED_STACKS,
  DISPLAY_BUCKETS_REVIEW_STACKS,
  READY_BUCKET,
  REVIEW_BUCKET,
  WAITING_BUCKET,
} from '@/lib/pr-fixtures/pr-fixtures'

const meta: Meta<typeof BucketSection> = {
  title: 'Components/BucketSection',
  component: BucketSection,
  subcomponents: { PrRow } as Record<string, React.ComponentType<unknown>>,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'A bucket card: header with icon + label + count + info tooltip, body with stacked `PrRow`s separated by `Separator`. Renders a dimmed empty state when the bucket has no PRs.',
      },
    },
  },
}

export default meta
type Story = StoryObj<typeof BucketSection>

export const ReviewPopulated: Story = {
  args: { bucket: 'review', prs: REVIEW_BUCKET },
}

export const ReviewStack: Story = {
  args: { bucket: 'review', items: DISPLAY_BUCKETS_REVIEW_STACKS.review },
}

export const ReviewEmpty: Story = {
  args: { bucket: 'review', prs: [] },
}

export const AttentionPopulated: Story = {
  args: { bucket: 'attention', prs: ATTENTION_BUCKET },
}

export const AttentionEmpty: Story = {
  args: { bucket: 'attention', prs: [] },
}

export const ReadyPopulated: Story = {
  args: { bucket: 'ready', prs: READY_BUCKET },
}

export const ReadyEmpty: Story = {
  args: { bucket: 'ready', prs: [] },
}

export const WaitingPopulated: Story = {
  args: { bucket: 'waiting', prs: WAITING_BUCKET },
}

export const WaitingNestedStack: Story = {
  args: { bucket: 'waiting', items: DISPLAY_BUCKETS_NESTED_STACKS.waiting },
}

export const WaitingEmpty: Story = {
  args: { bucket: 'waiting', prs: [] },
}

export const DraftsPopulated: Story = {
  args: { bucket: 'drafts', prs: DRAFTS_BUCKET },
}

export const DraftsEmpty: Story = {
  args: { bucket: 'drafts', prs: [] },
}

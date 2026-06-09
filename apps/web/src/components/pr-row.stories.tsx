import type { Meta, StoryObj } from '@storybook/react-vite'
import { PrRow } from './pr-row'
import {
  ATTENTION_CHANGES_REQUESTED,
  ATTENTION_NEW_COMMENTS,
  DRAFT,
  READY_TO_MERGE,
  REVIEW_NO_CI,
  REVIEW_REQUESTED_FAILURE,
  REVIEW_REQUESTED_SUCCESS,
  REVIEW_RE_REVIEW_PENDING,
  WAITING_CONFLICT,
  WAITING_PENDING,
} from '@/lib/pr-fixtures/pr-fixtures'

const meta: Meta<typeof PrRow> = {
  title: 'Components/PrRow',
  component: PrRow,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'A single PR row: CI status icon, review-decision badge, repo#number, comments + unresolved indicator, time-since-activity, and a meta line (author/branch + contextual hint). Click opens the PR on GitHub.',
      },
    },
  },
}

export default meta
type Story = StoryObj<typeof PrRow>

export const ReviewCiSuccess: Story = {
  args: { pr: REVIEW_REQUESTED_SUCCESS, bucket: 'review' },
}

export const ReviewCiPendingReReview: Story = {
  args: { pr: REVIEW_RE_REVIEW_PENDING, bucket: 'review' },
}

export const ReviewCiFailure: Story = {
  args: { pr: REVIEW_REQUESTED_FAILURE, bucket: 'review' },
}

export const ReviewNoCi: Story = {
  args: { pr: REVIEW_NO_CI, bucket: 'review' },
}

export const AttentionChangesRequested: Story = {
  args: { pr: ATTENTION_CHANGES_REQUESTED, bucket: 'attention' },
}

export const AttentionNewComments: Story = {
  args: { pr: ATTENTION_NEW_COMMENTS, bucket: 'attention' },
}

export const ReadyToMerge: Story = {
  args: { pr: READY_TO_MERGE, bucket: 'ready' },
}

export const AutoRetargeted: Story = {
  args: {
    pr: {
      ...READY_TO_MERGE,
      autoRetarget: { previousBaseRefName: 'feat/dashboard-stack-grouping' },
    },
    bucket: 'ready',
  },
}

export const WaitingPending: Story = {
  args: { pr: WAITING_PENDING, bucket: 'waiting' },
}

export const WaitingConflict: Story = {
  args: { pr: WAITING_CONFLICT, bucket: 'waiting' },
}

export const Draft: Story = {
  args: { pr: DRAFT, bucket: 'drafts' },
}

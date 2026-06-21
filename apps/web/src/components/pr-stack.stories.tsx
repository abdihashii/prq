import type { Meta, StoryObj } from '@storybook/react-vite'
import { PrStack } from './pr-stack'
import {
  AUTO_RETARGET_STACK,
  NESTED_STACK,
  REVIEW_STACK,
} from '@/lib/pr-fixtures/pr-fixtures'

const meta = {
  title: 'Components/PrStack',
  component: PrStack,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'A stacked-PR tree: the root PR with descendants indented and connected by branch lines, recomputed from base→head edges. Each node is a PrRow.',
      },
    },
  },
} satisfies Meta<typeof PrStack>

export default meta
type Story = StoryObj<typeof meta>

export const Nested: Story = {
  args: { root: NESTED_STACK, bucket: 'ready' },
}

export const Review: Story = {
  args: { root: REVIEW_STACK, bucket: 'review' },
}

export const AutoRetargeted: Story = {
  args: { root: AUTO_RETARGET_STACK, bucket: 'ready' },
}

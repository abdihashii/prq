import type { Meta, StoryObj } from '@storybook/react-vite'
import { ManageAccess } from './manage-access'
import {
  INSTALLATION_USER,
  INSTALLATIONS_MULTI,
} from '@/lib/access-fixtures/access-fixtures'

const meta = {
  title: 'Components/ManageAccess',
  component: ManageAccess,
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Footnote linking out to GitHub to widen repo access: one deep-link per installation, or a single install-new fallback when there are none.',
      },
    },
  },
} satisfies Meta<typeof ManageAccess>

export default meta
type Story = StoryObj<typeof meta>

export const SingleInstallation: Story = {
  args: { installations: [INSTALLATION_USER], repoCount: 5 },
}

export const MultipleInstallations: Story = {
  args: { installations: INSTALLATIONS_MULTI, repoCount: 8 },
}

export const NoInstallations: Story = {
  args: { installations: [], repoCount: 0 },
}

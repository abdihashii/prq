import type { Preview } from '@storybook/react-vite'
import { withThemeByClassName } from '@storybook/addon-themes'
import { TooltipProvider } from '../src/components/ui/tooltip'
import '../src/styles.css'

const preview: Preview = {
  tags: ['autodocs'],
  decorators: [
    withThemeByClassName({
      themes: { light: '', dark: 'dark' },
      defaultTheme: 'light',
    }),
    (Story) => (
      <TooltipProvider>
        <div className="bg-background text-foreground p-6">
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
  parameters: {
    backgrounds: { disable: true },
    options: {
      // Sort groups and components alphabetically, but leave stories within a
      // component in their declared order (equal titles -> 0) so curated
      // sequences like PrRow's Review -> Attention -> Ready stay intact.
      storySort: (a, b) =>
        a.title === b.title ? 0 : a.title.localeCompare(b.title, undefined, { numeric: true }),
    },
  },
}

export default preview

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
  },
}

export default preview

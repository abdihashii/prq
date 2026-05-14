import type { StorybookConfig } from '@storybook/react-vite'

const config: StorybookConfig = {
  framework: '@storybook/react-vite',
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-themes'],
  async viteFinal(config) {
    const tanstackPattern = /^(@tanstack|tanstack)[/\-:]/
    const flat = (config.plugins ?? []).flat(Infinity) as Array<{ name?: string } | null | false>
    config.plugins = flat.filter((plugin): plugin is { name?: string } => {
      if (!plugin || typeof plugin !== 'object') return false
      const name = 'name' in plugin && typeof plugin.name === 'string' ? plugin.name : ''
      return !tanstackPattern.test(name)
    })
    return config
  },
}

export default config

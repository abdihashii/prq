import type { CodegenConfig } from '@graphql-codegen/cli'

const config: CodegenConfig = {
  schema: 'node_modules/@octokit/graphql-schema/schema.json',
  documents: 'src/queries/*.graphql',
  generates: {
    'src/__generated__/github.ts': {
      plugins: ['typescript', 'typescript-operations'],
      config: {
        useTypeImports: true,
        enumsAsTypes: true,
        nonOptionalTypename: true,
        avoidOptionals: false,
        scalars: {
          DateTime: 'string',
          URI: 'string',
          GitObjectID: 'string',
          ID: 'string',
          GitTimestamp: 'string',
          HTML: 'string',
          Base64String: 'string',
          PreciseDateTime: 'string',
        },
      },
    },
  },
}

export default config

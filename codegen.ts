import type { CodegenConfig } from '@graphql-codegen/cli';

// `npm run codegen`: generates resolver and input types from the schema. The schema is the source of truth.
const config: CodegenConfig = {
  overwrite: true,
  schema: 'src/schema/typeDefs.graphql',
  generates: {
    'src/schema/__generated__/types.ts': {
      plugins: ['typescript', 'typescript-resolvers'],
      config: {
        // Node runs this file by stripping types: `import type`, `.ts` extensions and no TS enums.
        useTypeImports: true,
        importExtension: '.ts',
        enumsAsTypes: true,
        contextType: '../../context.ts#AppContext',
        // Makes a model unassignable to a schema type, so conversion cannot be skipped.
        nonOptionalTypename: true,
        // A mapper must set every field, nullable ones included.
        avoidOptionals: { field: true },
      },
    },
  },
};

export default config;

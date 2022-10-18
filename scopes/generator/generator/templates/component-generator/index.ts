import { ComponentContext, ComponentTemplate } from '@teambit/generator';
import { indexFile } from './files/index';
import { aspectFile } from './files/aspect-file';
import { docsFile } from './files/docs-file';
import { mainRuntime } from './files/main-runtime';

export const componentGeneratorTemplate: ComponentTemplate = {
  name: 'component-generator',
  description:
    'create your own component generator \nDocs: https://bit.dev/docs/dev-services/generator/generate-component',
  generateFiles: (context: ComponentContext) => {
    return [
      {
        relativePath: 'index.ts',
        content: indexFile(context),
        isMain: true,
      },
      {
        relativePath: `${context.name}.aspect.ts`,
        content: aspectFile(context),
      },
      {
        relativePath: `${context.name}.docs.mdx`,
        content: docsFile(),
      },
      {
        relativePath: `${context.name}.main.runtime.ts`,
        content: mainRuntime(context),
      },
    ];
  },
  config: {
    'teambit.harmony/aspect': {},
    'teambit.envs/envs': {
      env: 'teambit.harmony/aspect',
    },
  },
};

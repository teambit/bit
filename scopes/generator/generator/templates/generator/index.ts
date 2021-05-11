import { ComponentContext, ComponentTemplate } from '@teambit/generator';
import { indexFile } from './files/index';
import { aspectFile } from './files/aspect-file';
import { docsFile } from './files/docs-file';
import { mainRuntime } from './files/main-runtime';

export const generatorTemplate: ComponentTemplate = {
  name: 'generator',
  description: 'create your own component generator',
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
};

import { ComponentContext, ComponentTemplate } from '@teambit/generator';
import { indexFile } from './files/index';
import { docFile } from './files/doc';
import { mainFile } from './files/main';

export const nodeEnvTemplate: ComponentTemplate = {
  name: 'node-env',
  description: 'customize the base Node env with your configs and tools',
  generateFiles: (context: ComponentContext) => {
    return [
      {
        relativePath: 'index.ts',
        content: indexFile(),
        isMain: true,
      },
      {
        relativePath: `${context.name}.docs.mdx`,
        content: docFile(),
      },
      {
        relativePath: `${context.name}.extension.ts`,
        content: mainFile(),
      },
    ];
  },
};

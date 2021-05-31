import { ComponentContext, ComponentTemplate } from '@teambit/generator';
import { indexFile } from './files/index';
import { docFile } from './files/doc';
import { extensionFile } from './files/extension';

export const reactEnvTemplate: ComponentTemplate = {
  name: 'react-env',
  description: 'customize the base React env with your configs and tools',
  generateFiles: (context: ComponentContext) => {
    return [
      {
        relativePath: 'index.ts',
        content: indexFile(context),
        isMain: true,
      },
      {
        relativePath: `${context.name}.docs.mdx`,
        content: docFile(),
      },
      {
        relativePath: `${context.name}.extension.ts`,
        content: extensionFile(context),
      },
    ];
  },
};

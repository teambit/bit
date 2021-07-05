import { ComponentContext, ComponentTemplate } from '@teambit/generator';
import { indexFile } from './files/index';
import { docsFile } from './files/docs';
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
      docsFile(context),
      {
        relativePath: `${context.name}.extension.ts`,
        content: extensionFile(context),
      },
    ];
  },
};

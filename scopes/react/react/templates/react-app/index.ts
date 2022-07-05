import { ComponentContext, ComponentTemplate } from '@teambit/generator';
import { appPlugin } from './files/app-plugin';
import { indexFile } from './files/index';
import { docFile } from './files/doc';
import { compositionsFile } from './files/compositions';
import { appFile } from './files/app';
import { appRootFile } from './files/app-root';

export const reactAppTemplate: ComponentTemplate = {
  name: 'react-app',
  hidden: true,
  description: 'Creates a React app',
  generateFiles: (context: ComponentContext) => {
    return [
      {
        relativePath: 'index.ts',
        content: indexFile(context),
        isMain: true,
      },
      {
        relativePath: `${context.name}.docs.mdx`,
        content: docFile(context),
      },
      {
        relativePath: `${context.name}.react-app.ts`,
        content: appPlugin(context),
      },
      {
        relativePath: `${context.name}.compositions.tsx`,
        content: compositionsFile(context),
      },
      {
        relativePath: `app.tsx`,
        content: appFile(context),
      },
      {
        relativePath: `${context.name}.app-root.tsx`,
        content: appRootFile(context),
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

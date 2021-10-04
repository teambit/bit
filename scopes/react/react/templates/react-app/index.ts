import { ComponentContext, ComponentTemplate } from '@teambit/generator';
import { indexFile } from './files/index';
import { docFile } from './files/doc';
import { mainRuntimeFile } from './files/main.runtime';
import { compositionsFile } from './files/compositions';
import { aspectFile } from './files/aspect';
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
        relativePath: `${context.name}.main.runtime.ts`,
        content: mainRuntimeFile(context),
      },
      {
        relativePath: `${context.name}.compositions.tsx`,
        content: compositionsFile(context),
      },
      {
        relativePath: `${context.name}.aspect.ts`,
        content: aspectFile(context),
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
};

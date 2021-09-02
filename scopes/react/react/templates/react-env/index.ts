import { ComponentContext, ComponentTemplate } from '@teambit/generator';
import { indexFile } from './files/index';
import { docFile } from './files/doc';
import { mainRuntimeFile } from './files/main.runtime';
import { previewRuntimeFile } from './files/preview.runtime';
import { aspectFile } from './files/aspect';
import { webpackConfigFile } from './files/webpack.config';
import { typescriptConfigFile } from './files/typescript.config';
import { jestConfigFile } from './files/jest.config';

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
        content: docFile(context),
      },
      {
        relativePath: `${context.name}.main.runtime.ts`,
        content: mainRuntimeFile(context),
      },
      {
        relativePath: `${context.name}.preview.runtime.ts`,
        content: previewRuntimeFile(context),
      },
      {
        relativePath: `${context.name}.aspect.ts`,
        content: aspectFile(context),
      },
      {
        relativePath: `webpack/webpack-transformers.ts`,
        content: webpackConfigFile(),
      },
      {
        relativePath: `typescript/tsconfig.json`,
        content: typescriptConfigFile(),
      },
      {
        relativePath: `jest/jest.config.js`,
        content: jestConfigFile(),
      },
    ];
  },
};

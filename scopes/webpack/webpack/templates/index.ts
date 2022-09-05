import { ComponentContext, ComponentTemplate } from '@teambit/generator';
import { indexFile } from './files/index';
import { docs } from './files/docs';
import { webpackTransformerFile } from './files/webpack-transformer';

export const webpackTransformerTemplate: ComponentTemplate = {
  name: 'webpack-transformer',
  description: "create a shareable webpack transformation to customise an env's webpack configuration",
  generateFiles: (context: ComponentContext) => {
    return [
      {
        relativePath: 'index.ts',
        content: indexFile(context),
        isMain: true,
      },
      {
        relativePath: `${context.name}.docs.mdx`,
        content: docs(),
      },
      {
        relativePath: `${context.name}.transformer.ts`,
        content: webpackTransformerFile(),
      },
    ];
  },
  config: {
    'teambit.harmony/node': {},
    'teambit.envs/envs': {
      env: 'teambit.harmony/node',
    },
  },
};

import { ComponentContext, ComponentTemplate } from '@teambit/generator';
import { indexFile } from './files/index';
import { docs } from './files/docs';
import { tsTransformerFile } from './files/typescript-transformer';
import { globalStylesFile } from './files/styles';
import { typescriptConfigFile } from './files/typescript.config';

export const typescriptTransformerTemplate: ComponentTemplate = {
  name: 'typescript-transformer',
  description: "create a shareable typescript transformation to customise an env's typescript configuration",
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
        content: tsTransformerFile(),
      },
      {
        relativePath: `styles.ts`,
        content: globalStylesFile(),
      },
      {
        relativePath: `ts-config.ts`,
        content: typescriptConfigFile(),
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

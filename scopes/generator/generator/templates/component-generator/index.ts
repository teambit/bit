import { ComponentContext, ComponentTemplate } from '../../component-template';
import { indexFile } from './files/index';
import { generateTestFileContent } from './files/component-template-files/test';
import { generateComponentFileContent } from './files/component-template-files/component';
import { generateCompositionFileContent } from './files/component-template-files/composition';
import { generateIndexFileContent } from './files/component-template-files/index-file';
import { componentTemplate } from './files/component-template';

export const componentGeneratorTemplate: ComponentTemplate = {
  name: 'component-generator',
  description: 'create your own component generator \nDocs: https://bit.dev/reference/generator/create-generator',
  hidden: true,
  generateFiles: (context: ComponentContext) => {
    return [
      {
        relativePath: 'index.ts',
        content: indexFile(context),
        isMain: true,
      },

      {
        relativePath: `./${context.name}.ts`,
        content: componentTemplate(context),
      },
      {
        relativePath: `./files/test-file.ts`,
        content: generateTestFileContent(),
      },
      {
        relativePath: `./files/composition-file.ts`,
        content: generateCompositionFileContent(),
      },
      {
        relativePath: `./files/component-file.ts`,
        content: generateComponentFileContent(),
      },
      {
        relativePath: `./files/index-file.ts`,
        content: generateIndexFileContent(),
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

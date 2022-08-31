import { ComponentContext, ComponentTemplate } from '@teambit/generator';
import { indexFile } from './files/index';
import { starterFile } from './files/starter';
import { docsFile } from './files/docs-file';
import { gitIgnoreTemplate } from './files/git-ignore-tpl';
import { readmeTemplate } from './files/readme-tpl';
import { workspaceConfigTemplate } from './files/workspace-config-tpl';

export const starterTemplate: ComponentTemplate = {
  name: 'starter',
  description:
    'create your own starter - \nDocs: https://bit.dev/docs/dev-services/generator/generate-workspace',
  generateFiles: (context: ComponentContext) => {
    return [
      {
        relativePath: 'index.ts',
        content: indexFile(context),
        isMain: true,
      },
      {
        relativePath: `${context.name}.starter.ts`,
        content: starterFile(),
      },
      {
        relativePath: `${context.name}.docs.mdx`,
        content: docsFile(),
      },
      {
        relativePath: 'template/files/git-ignore.ts',
        content: gitIgnoreTemplate(),
      },
      {
        relativePath: 'template/files/readme-file.ts',
        content: readmeTemplate(),
      },
      {
        relativePath: 'template/files/workspace-config.ts',
        content: workspaceConfigTemplate(),
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

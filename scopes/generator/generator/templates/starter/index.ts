import type { ComponentContext, ComponentTemplate } from '../../';
import { indexFile } from './files/index';
import { starterFile } from './files/starter';
import { docFile } from './files/doc-file';
import { gitIgnoreTemplate } from './files/git-ignore-tpl';
import { workspaceConfigTemplate } from './files/workspace-config-tpl';
import { generateFiles } from './files/generate-files';

export const starterTemplate: ComponentTemplate = {
  name: 'starter',
  description:
    'create your own workspace starter (env integrated) - \nDocs: https://bit.dev/reference/starters/create-starter',
  hidden: true,
  generateFiles: (context: ComponentContext) => {
    return [
      {
        relativePath: 'index.ts',
        content: indexFile(context),
        isMain: true,
      },
      {
        relativePath: `${context.name}.starter.ts`,
        content: starterFile(context),
      },
      {
        relativePath: `${context.name}.docs.mdx`,
        content: docFile(context),
      },
      {
        relativePath: 'template/files/git-ignore.ts',
        content: gitIgnoreTemplate(),
      },

      {
        relativePath: 'template/files/workspace-config.ts',
        content: workspaceConfigTemplate(),
      },
      {
        relativePath: 'template/files/generate-files.ts',
        content: generateFiles(),
      },
    ];
  },
  config: {
    'teambit.harmony/aspect': {},
    'teambit.envs/envs': {
      env: 'teambit.harmony/node',
    },
  },
};

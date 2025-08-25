import type { ComponentContext, ComponentTemplate } from '../../component-template';
import { indexFile } from './files/index';
import { starterFile } from './files/starter';
import { docFile } from './files/doc-file';
import { gitIgnoreTemplate } from './files/git-ignore-tpl';
import { workspaceConfigTemplate } from './files/workspace-config-tpl';

export const starterTemplate: ComponentTemplate = {
  name: 'standalone-starter',
  hidden: true,
  description:
    'create your own workspace starter (standalone) - \nDocs: https://bit.dev/reference/starters/create-starter',
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
    ];
  },
  config: {
    'teambit.harmony/aspect': {},
    'teambit.envs/envs': {
      env: 'teambit.harmony/aspect',
    },
  },
};

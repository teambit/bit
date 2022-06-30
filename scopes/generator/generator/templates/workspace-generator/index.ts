import { ComponentContext, ComponentTemplate } from '@teambit/generator';
import { indexFile } from './files/index';
import { aspectFile } from './files/aspect-file';
import { docsFile } from './files/docs-file';
import { mainRuntime } from './files/main-runtime';
import { gitIgnoreTemplate } from './files/git-ignore-tpl';
import { readmeTemplate } from './files/readme-tpl';
import { indexTemplate } from './files/index-tpl';
import { workspaceConfigTemplate } from './files/workspace-config-tpl';

export const workspaceGeneratorTemplate: ComponentTemplate = {
  name: 'workspace-generator',
  description:
    'create your own workspace generator - \nDocs: https://bit.dev/docs/dev-services-overview/generator/generate-workspace',
  generateFiles: (context: ComponentContext) => {
    return [
      {
        relativePath: 'index.ts',
        content: indexFile(context),
        isMain: true,
      },
      {
        relativePath: `${context.name}.aspect.ts`,
        content: aspectFile(context),
      },
      {
        relativePath: `${context.name}.main.runtime.ts`,
        content: mainRuntime(context),
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
      {
        relativePath: 'template/index.ts',
        content: indexTemplate(),
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

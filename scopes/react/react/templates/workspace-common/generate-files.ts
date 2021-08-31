import { WorkspaceContext } from '@teambit/generator';
import { workspaceConfig } from './files/workspace-config';
import { readme } from './files/readme-file';
import { gitIgnore } from './files/git-ignore';
import { assetTypes } from './files/types/asset';
import { styleTypes } from './files/types/style';

type GeneratedFile = {
  relativePath: string;
  content: string;
};

export async function generateFiles(context: WorkspaceContext): Promise<GeneratedFile[]> {
  return [
    {
      relativePath: 'workspace.jsonc',
      content: await workspaceConfig(context),
    },
    {
      relativePath: `.gitignore`,
      content: gitIgnore(),
    },
    {
      relativePath: `README.md`,
      content: readme(),
    },
    {
      relativePath: `types/asset.d.ts`,
      content: assetTypes,
    },
    {
      relativePath: `types/style.d.ts`,
      content: styleTypes,
    },
  ];
}

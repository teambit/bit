import { WorkspaceContext } from '@teambit/generator';
import { workspaceConfig } from './files/workspace-config';
import { readme } from './files/readme-file';
import { gitIgnore } from './files/git-ignore';
import { assetTypes } from './files/types/asset';
import { styleTypes } from './files/types/style';
import { eslintConfig } from './files/eslint-config';
import { tsConfig } from './files/ts-config';
import { prettierConfig } from './files/prettier-config';
import { launchJson } from './files/launch-json';

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
      relativePath: '.vscode/launch.json',
      content: launchJson(context),
    },
    {
      relativePath: `README.md`,
      content: readme(),
    },
    {
      relativePath: `.eslintrc.js`,
      content: eslintConfig,
    },
    {
      relativePath: `tsconfig.json`,
      content: tsConfig,
    },
    {
      relativePath: `.prettierrc.js`,
      content: prettierConfig,
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

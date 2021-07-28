import { WorkspaceContext } from '@teambit/generator';
import { getWorkspaceConfigTemplateParsed, stringifyWorkspaceConfig } from '@teambit/config';

export async function workspaceConfig({ name, defaultScope }: WorkspaceContext) {
  const configParsed = await getWorkspaceConfigTemplateParsed();
  configParsed['teambit.workspace/workspace'].name = name;
  configParsed['teambit.workspace/workspace'].defaultScope = defaultScope || 'company.scope';
  configParsed['teambit.dependencies/dependency-resolver'].packageManager = 'teambit.dependencies/pnpm';
  configParsed['teambit.dependencies/dependency-resolver'].policy = {
    dependencies: {},
    peerDependencies: {
      '@testing-library/react': '11.2.6',
      react: '16.13.1',
      'react-dom': '16.13.1',
    },
  };
  configParsed['teambit.workspace/variants'] = {
    '{ui/**}, {pages/**}': {
      'teambit.react/templates/envs/my-react': {},
    },
    '{styles/**}': {
      'teambit.react/react': {},
    },
    '{themes/**}': {
      'teambit.react/react': {},
    },
    '{envs/*}, {apps/*}': {
      'teambit.harmony/aspect': {},
    },
  };

  return stringifyWorkspaceConfig(configParsed);
}

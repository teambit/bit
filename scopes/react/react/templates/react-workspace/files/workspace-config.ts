import { WorkspaceContext } from '@teambit/generator';
import { getWorkspaceConfigTemplateParsed, stringifyWorkspaceConfig } from '@teambit/config';

export async function workspaceConfig({ name, defaultScope, empty }: WorkspaceContext) {
  const scope = defaultScope || 'company.scope';
  const configParsed = await getWorkspaceConfigTemplateParsed();
  configParsed['teambit.workspace/workspace'].name = name;
  configParsed['teambit.workspace/workspace'].defaultScope = scope;
  // configParsed['teambit.workspace/workspace'].defaultDirectory = scope;
  configParsed['teambit.dependencies/dependency-resolver'].packageManager = 'teambit.dependencies/pnpm';
  configParsed['teambit.dependencies/dependency-resolver'].policy = {
    dependencies: {},
    peerDependencies: {
      '@testing-library/react': '11.2.6',
      react: '16.13.1',
      'react-dom': '16.13.1',
    },
  };

  configParsed['teambit.workspace/variants'] = empty
    ? {
        '*': {
          'teambit.react/react': {},
        },
      }
    : {
        '{ui/**}, {pages/**}': {
          // uses the custom env
          [`${scope}/envs/my-react`]: {},
          // uncomment the line below if you remove the custom env and remove the line above
          // 'teambit.react/react': {},
        },
        '{envs/**}': {
          'teambit.harmony/aspect': {},
        },
      };

  return stringifyWorkspaceConfig(configParsed);
}

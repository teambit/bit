import { getWorkspaceConfigTemplateParsed, stringifyWorkspaceConfig } from '@teambit/config';
import { WorkspaceContext } from '../../../../workspace-template';

export async function workspaceConfig({ name, defaultScope }: WorkspaceContext) {
  const configParsed = await getWorkspaceConfigTemplateParsed();
  const packageManagerDefaultConfig = configParsed['teambit.dependencies/dependency-resolver'];
  configParsed['teambit.workspace/workspace'].name = name;
  configParsed['teambit.workspace/workspace'].defaultScope = defaultScope || 'org.scope';
  configParsed['teambit.dependencies/dependency-resolver'] = {
    ...packageManagerDefaultConfig,
    policy: {
      dependencies: {
        '@types/node': '16.18.44',
        '@types/jest': '29.5.4',
      },
    },
  };

  // configParsed['teambit.generator/generator'] = {
  //   envs: [
  //     'teambit.node/node',
  //     "bitdev.react/react-env",
  //      "teambit.vue/vue",
  //      "teambit.react/react-env",
  //      "teambit.html/html-env"
  //   ],
  // };

  return stringifyWorkspaceConfig(configParsed);
}

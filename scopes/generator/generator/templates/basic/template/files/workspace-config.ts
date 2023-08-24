import { getWorkspaceConfigTemplateParsed, stringifyWorkspaceConfig } from '@teambit/config';
import { WorkspaceContext } from '../../../..';

export async function workspaceConfig({ name, defaultScope }: WorkspaceContext) {
  const configParsed = await getWorkspaceConfigTemplateParsed();
  const packageManagerDefaultConfig = configParsed['teambit.dependencies/dependency-resolver'];
  configParsed['teambit.workspace/workspace'].name = name;
  configParsed['teambit.workspace/workspace'].defaultScope = defaultScope || 'org.scope';
  configParsed['teambit.dependencies/dependency-resolver'] = {
    ...packageManagerDefaultConfig,
    policy: {
      dependencies: {
        '@teambit/node.node': 'latest',
        '@types/node': '16.18.44',
        '@types/jest': '29.5.4',
      },
    },
  };

  delete configParsed['teambit.workspace/variants'];

  configParsed['teambit.generator/generator'] = {
    envs: [
      'teambit.node/node',
      //  "teambit.angular/angular",
      //  "teambit.vue/vue",
      //  "teambit.react/react-env",
      //  "teambit.html/html-env"
    ],
  };

  return stringifyWorkspaceConfig(configParsed);
}

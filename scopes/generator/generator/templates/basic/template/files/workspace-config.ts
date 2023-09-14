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
        "eslint": "7.32.0",
        '@typescript-eslint/eslint-plugin': '5.35.1',
        'eslint-import-resolver-node': '0.3.6',
        'eslint-plugin-import': '2.22.1',
        'eslint-plugin-jest': '24.1.5',
        'eslint-plugin-jsx-a11y': '6.4.1',
        'eslint-plugin-mdx': '1.17.1',
        'eslint-plugin-react': '7.22.0',
      },
    },
  };

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

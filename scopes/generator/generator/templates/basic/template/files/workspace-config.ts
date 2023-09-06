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
        '@teambit/eslint-config-bit-react': '^0.0.367',
        '@typescript-eslint/eslint-plugin': '4.29.3',
        'eslint-import-resolver-node': '0.3.6',
        'eslint-plugin-import': '2.22.1',
        'eslint-plugin-jest': '24.1.5',
        'eslint-plugin-jsx-a11y': '6.4.1',
        'eslint-plugin-mdx': '1.13.0',
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

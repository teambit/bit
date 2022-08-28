import { WorkspaceContext } from '@teambit/generator';
import { getWorkspaceConfigTemplateParsed, stringifyWorkspaceConfig } from '@teambit/config';
import { parse, assign } from 'comment-json';

export async function workspaceConfig({ name, defaultScope }: WorkspaceContext, extraConfig?: Record<string, any>) {
  const scope = defaultScope || 'my-org.my-scope';
  const configParsed = await getWorkspaceConfigTemplateParsed();
  configParsed['teambit.workspace/workspace'].name = name;
  configParsed['teambit.workspace/workspace'].defaultScope = scope;
  configParsed['teambit.dependencies/dependency-resolver'].packageManager = 'teambit.dependencies/pnpm';
  configParsed['teambit.dependencies/dependency-resolver'].policy = {
    dependencies: {
      '@teambit/eslint-config-bit-react': '~0.0.367',
      '@typescript-eslint/eslint-plugin': '4.29.3',
      'eslint-import-resolver-node': '0.3.6',
      'eslint-plugin-import': '2.22.1',
      'eslint-plugin-jest': '24.4.0',
      'eslint-plugin-jsx-a11y': '6.4.1',
      'eslint-plugin-mdx': '1.15.0',
      'eslint-plugin-react': '7.25.1',
    },
    peerDependencies: {
      '@testing-library/react': '^12.1.5',
      react: '17.0.2',
      'react-dom': '17.0.2',
    },
  };

  const variants = {
    'teambit.workspace/variants': parse(`{}`),
  };

  let configMerged = assign(configParsed, variants);

  if (extraConfig) {
    configMerged = assign(configMerged, extraConfig);
  }

  return stringifyWorkspaceConfig(configMerged);
}

import { WorkspaceContext } from '@teambit/generator';
import { getWorkspaceConfigTemplateParsed, stringifyWorkspaceConfig } from '@teambit/config';
import { parse, assign } from 'comment-json';

export async function workspaceConfig({ name, defaultScope, empty }: WorkspaceContext) {
  const scope = defaultScope || 'company.scope';
  const configParsed = await getWorkspaceConfigTemplateParsed();
  configParsed['teambit.workspace/workspace'].name = name;
  configParsed['teambit.workspace/workspace'].defaultScope = scope;
  configParsed['teambit.dependencies/dependency-resolver'].packageManager = 'teambit.dependencies/pnpm';
  configParsed['teambit.dependencies/dependency-resolver'].policy = {
    dependencies: {},
    peerDependencies: {
      '@testing-library/react': '12.0.0',
      react: '17.0.2',
      'react-dom': '17.0.2',
    },
  };

  const variants = {
    'teambit.workspace/variants': empty
      ? {
          '*': {
            'teambit.react/react': {},
          },
        }
      : parse(`{
      "{ui/**}, {pages/**}": {
        // uses the custom env
        "${scope}/envs/my-react": {},
        // uncomment the line below if you remove the custom env and remove the line above
        // "teambit.react/react": {},
      },
      '{themes/**}': {
      'teambit.react/react': {},
    },
      "{content/**}": {
        "teambit.mdx/mdx": {},
      },
      "{envs/**}, {extensions/**}": {
        "teambit.harmony/aspect": {},
      },
    }`),
  };

  const configMerged = assign(configParsed, variants);

  return stringifyWorkspaceConfig(configMerged);
}

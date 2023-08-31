export function workspaceConfigTemplate() {
  return `import { WorkspaceContext } from '@teambit/generator';
import { getWorkspaceConfigTemplateParsed, stringifyWorkspaceConfig } from '@teambit/config';

export async function workspaceConfig({ name, defaultScope }: WorkspaceContext) {
  const configParsed = await getWorkspaceConfigTemplateParsed();
  configParsed['teambit.workspace/workspace'].name = name;
  configParsed['teambit.workspace/workspace'].defaultScope = defaultScope || 'org.scope';
  configParsed['teambit.generator/generator'] = {
    envs: [
      'teambit.react/react-env',
      'teambit.node/node',
    ],
  };
  configParsed['teambit.workspace/variants'] = {
    '*': {},
  };

  return stringifyWorkspaceConfig(configParsed);
}
`;
}

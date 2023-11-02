export function workspaceConfigTemplate() {
  return `import { WorkspaceContext } from '@teambit/generator';
import { getWorkspaceConfigTemplateParsed, stringifyWorkspaceConfig } from '@teambit/config';

export async function workspaceConfig({ name, defaultScope }: WorkspaceContext) {
  const scope = defaultScope || 'org.scope';
  const configParsed = await getWorkspaceConfigTemplateParsed();
  configParsed['teambit.workspace/workspace'].name = name;
  configParsed['teambit.workspace/workspace'].defaultScope = scope;
  configParsed['teambit.generator/generator'] = {
    envs: [
     scope + '/react/react-env',
    ],
  };
  configParsed['teambit.workspace/variants'] = {
    '*': {},
  };

  return stringifyWorkspaceConfig(configParsed);
}
`;
}

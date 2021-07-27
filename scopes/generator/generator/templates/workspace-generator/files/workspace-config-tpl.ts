export function workspaceConfigTemplate() {
  return `import { WorkspaceContext } from '@teambit/generator';
import { getWorkspaceConfigTemplateParsed, stringifyWorkspaceConfig } from '@teambit/config';

export async function workspaceConfig({ name, defaultScope }: WorkspaceContext) {
  const configParsed = await getWorkspaceConfigTemplateParsed();
  configParsed['teambit.workspace/workspace'].name = name;
  configParsed['teambit.workspace/workspace'].defaultScope = defaultScope || 'company.collection';
  configParsed['teambit.workspace/variants'] = {
    '*': {
      'teambit.react/react': {},
    },
  };

  return stringifyWorkspaceConfig(configParsed);
}
`;
}

export function workspaceConfigTemplate() {
  return `import { WorkspaceContext } from '@teambit/generator';
import { getWorkspaceConfigTemplateFile } from '@teambit/config';
import { parse, stringify } from 'comment-json';

export async function workspaceConfig({ name, defaultScope }: WorkspaceContext) {
  const workspaceConfigTemplate = await getWorkspaceConfigTemplateFile();
  const configParsed = parse(workspaceConfigTemplate);
  configParsed['teambit.workspace/workspace'].name = name;
  configParsed['teambit.workspace/workspace'].defaultScope = defaultScope || 'my-scope';
  configParsed['teambit.workspace/variants'] = {
    '*': {
      'teambit.react/react': {},
    },
  };

  return stringify(configParsed, undefined, 2);
}
`;
}

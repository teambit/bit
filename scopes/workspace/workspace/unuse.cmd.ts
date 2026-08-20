import type { Command, CommandOptions } from '@teambit/cli';
import { formatSuccessSummary, formatHint } from '@teambit/cli';
import type { Workspace } from './workspace';

export class UnuseCmd implements Command {
  name = 'unuse <component-id>';
  group = 'workspace-setup';
  description = 'unset aspects in the workspace config (opposite of "use" command)';
  arguments = [{ name: 'component-id', description: 'the component ID of the aspect' }];
  alias = '';
  options = [] as CommandOptions;
  loader = true;
  remoteOp = true;
  private = true;

  constructor(private workspace: Workspace) {}

  async report([id]: [string]): Promise<any> {
    const result = await this.workspace.unuse(id);
    if (!result) return formatHint(`"${id}" was not found in the workspace.jsonc file.`);
    return formatSuccessSummary(`workspace.jsonc updated! the aspect "${id}" has been removed.`);
  }
}

import { Command, CommandOptions } from '@teambit/cli';
import chalk from 'chalk';
import { Workspace } from './workspace';

export class UnuseCmd implements Command {
  name = 'unuse <component-id>';
  group = 'workspace-setup';
  description = 'unset aspects in the workspace config (opposite of "use" command)';
  arguments = [{ name: 'component-id', description: 'the component ID of the aspect' }];
  alias = '';
  options = [] as CommandOptions;
  loader = true;
  remoteOp = true;

  constructor(private workspace: Workspace) {}

  async report([id]: [string]): Promise<any> {
    const result = await this.workspace.unuse(id);
    if (!result) return chalk.yellow(`"${id}" was not found in the workspace.jsonc file.`);
    return chalk.green(`workspace.jsonc updated successfully! the aspect "${id}" has been removed.`);
  }
}

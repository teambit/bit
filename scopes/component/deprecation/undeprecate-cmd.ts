import chalk from 'chalk';
import { Workspace } from '@teambit/workspace';
import { Command, CommandOptions } from '@teambit/cli';
import { DeprecationMain } from './deprecation.main.runtime';

export class UndeprecateCmd implements Command {
  name = 'undeprecate <id>';
  group = 'collaborate';
  description = 'undeprecate a deprecated component (local/remote)';
  alias = '';
  options = [] as CommandOptions;
  loader = true;
  migration = true;
  skipWorkspace = true;
  remoteOp = true;

  constructor(private deprecation: DeprecationMain, private workspace: Workspace) {}

  async report([id]: [string]): Promise<string> {
    const result = await this.undeprecate(id);
    if (result) {
      return chalk.green(`the component "${id}" has been undeprecated successfully`);
    }
    return chalk.bold(`the component "${id}" is already undeprecated. no changes have been made`);
  }

  private async undeprecate(id: string) {
    const componentId = await this.workspace.resolveComponentId(id);
    return this.deprecation.unDeprecate(componentId);
  }
}

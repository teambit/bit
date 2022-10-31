import { Command, CommandOptions } from '@teambit/cli';
import chalk from 'chalk';
import { Workspace } from './workspace';

export class UseCmd implements Command {
  name = 'use <component-id>';
  group = 'collaborate';
  description = 'set aspects in the workspace/scope config to make them loadable by the workspace/scope';
  helpUrl = 'docs/workspace/workspace-json#adding-an-aspect-to-the-workspace';
  arguments = [{ name: 'component-id', description: 'the component ID of the aspect' }];
  alias = '';
  options = [] as CommandOptions;
  loader = true;
  migration = true;
  remoteOp = true;

  constructor(private workspace: Workspace) {}

  async report([id]: [string]): Promise<any> {
    const aspectIdAdded = await this.workspace.use(id);
    return chalk.green(`aspect "${aspectIdAdded}" has been saved into the workspace.jsonc file.`);
  }
}

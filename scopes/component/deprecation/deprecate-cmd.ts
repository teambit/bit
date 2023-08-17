import chalk from 'chalk';
import { Workspace } from '@teambit/workspace';
import { Command, CommandOptions } from '@teambit/cli';
import { DeprecationMain } from './deprecation.main.runtime';

export class DeprecateCmd implements Command {
  name = 'deprecate <component-name>';
  arguments = [{ name: 'component-name', description: 'component name or component id' }];
  description = 'deprecate a component';
  group = 'collaborate';
  skipWorkspace = true;
  alias = 'd';
  options = [
    [
      '',
      'new-id <string>',
      'if replaced by another component, enter the new component id. alternatively use "bit rename" to do this automatically',
    ],
  ] as CommandOptions;
  loader = true;
  migration = true;
  remoteOp = true;
  helpUrl = 'docs/components/removing-components';

  constructor(private deprecation: DeprecationMain, private workspace: Workspace) {}

  async report([id]: [string], { newId }: { newId?: string }): Promise<string> {
    const result = await this.deprecate(id, newId);
    if (result) {
      return chalk.green(`the component "${id}" has been deprecated successfully`);
    }
    return chalk.bold(`the component "${id}" is already deprecated. no changes have been made`);
  }

  private async deprecate(id: string, newId?: string): Promise<boolean> {
    const componentId = await this.workspace.resolveComponentId(id);
    const newComponentId = newId ? await this.workspace.resolveComponentId(newId) : undefined;
    return this.deprecation.deprecate(componentId, newComponentId);
  }
}

import chalk from 'chalk';
import type { Command, CommandOptions } from '@teambit/cli';
import type { DeprecationMain } from './deprecation.main.runtime';

export class UndeprecateCmd implements Command {
  name = 'undeprecate <id>';
  group = 'collaborate';
  description = 'undeprecate a deprecated component (local/remote)';
  alias = '';
  options = [] as CommandOptions;
  loader = true;
  skipWorkspace = true;
  remoteOp = true;

  constructor(private deprecation: DeprecationMain) {}

  async report([id]: [string]): Promise<string> {
    const result = await this.deprecation.unDeprecateByCLIValues(id);
    if (result) {
      return chalk.green(`the component "${id}" has been undeprecated successfully`);
    }
    return chalk.bold(`the component "${id}" is not currently deprecated. no changes have been made`);
  }
}

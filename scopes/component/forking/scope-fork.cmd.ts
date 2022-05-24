import { Command, CommandOptions } from '@teambit/cli';
import chalk from 'chalk';
import { ForkingMain } from './forking.main.runtime';

export class ScopeForkCmd implements Command {
  name = 'fork <old-scope> <new-scope>';
  description = 'rename a scope for components using the old-name, optionally change the dependencies source-code';
  options = [] as CommandOptions;
  group = 'development';

  constructor(private forking: ForkingMain) {}

  async report([originalScope, newScope]: [string, string]) {
    const forkedIds = await this.forking.forkScope(originalScope, newScope);
    const title = chalk.green(
      `successfully forked ${chalk.bold(originalScope)} into ${chalk.bold(
        newScope
      )}. the following components were created`
    );
    return `${title}\n${forkedIds.map((id) => id.toString()).join('\n')}`;
  }
}

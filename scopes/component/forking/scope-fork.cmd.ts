import { Command, CommandOptions } from '@teambit/cli';
import chalk from 'chalk';
import { ForkingMain } from './forking.main.runtime';

export class ScopeForkCmd implements Command {
  name = 'fork <original-scope> <new-scope>';
  description = 'fork all components of the original-scope and refactor the source-code to use the new package names';
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

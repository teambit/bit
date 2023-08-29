import { Command, CommandOptions } from '@teambit/cli';
import chalk from 'chalk';
import { ForkingMain } from './forking.main.runtime';

export type ScopeForkOptions = {
  ast?: boolean;
};
export class ScopeForkCmd implements Command {
  name = 'fork <original-scope> <new-scope>';
  description = 'fork all components of the original-scope and refactor the source-code to use the new scope name';
  options = [['', 'ast', 'EXPERIMENTAL. use ast to transform files instead of regex']] as CommandOptions;
  group = 'development';

  constructor(private forking: ForkingMain) {}

  async report([originalScope, newScope]: [string, string], options: ScopeForkOptions) {
    const forkedIds = await this.forking.forkScope(originalScope, newScope, options);
    const title = chalk.green(
      `successfully forked ${chalk.bold(originalScope)} into ${chalk.bold(
        newScope
      )}. the following components were created`
    );
    return `${title}\n${forkedIds.map((id) => id.toString()).join('\n')}`;
  }
}

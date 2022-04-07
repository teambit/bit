import chalk from 'chalk';
import { Command, CommandOptions } from '@teambit/cli';
import { ForkingMain } from '.';

export type ForkOptions = {
  scope?: string;
  path?: string;
  refactor?: boolean;
};

export class ForkCmd implements Command {
  name = 'fork <source-id> [target-name]';
  description = 'EXPERIMENTAL. create a new component out of an existing one';
  extendedDescription = `note that [target-name] is the name only without the scope.
to set the default-scope, please use --scope flag`;
  group = 'collaborate';
  skipWorkspace = true;
  alias = '';
  options = [
    ['s', 'scope <string>', 'default scope for the newly created component'],
    ['p', 'path <string>', 'relative path in the workspace. by default the path is `<scope>/<namespace>/<name>`'],
    [
      'r',
      'refactor',
      'change the source code of all components using the original component with the new package-name',
    ],
  ] as CommandOptions;
  loader = true;
  migration = true;
  remoteOp = true;

  constructor(private forking: ForkingMain) {}

  async report([sourceId, targetId]: [string, string], options: ForkOptions): Promise<string> {
    const results = await this.forking.fork(sourceId, targetId, options);
    const targetIdStr = results.toString();
    return chalk.green(`successfully forked ${chalk.bold(targetIdStr)} from ${chalk.bold(sourceId)}`);
  }
}

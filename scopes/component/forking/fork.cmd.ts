import chalk from 'chalk';
import { Command, CommandOptions } from '@teambit/cli';
import { Forker } from './forker';

export type ForkOptions = {
  scope?: string;
  path?: string;
};

export class ForkCmd implements Command {
  name = 'fork <source-id> [target-id]';
  description = 'EXPERIMENTAL. create a new component out of an existing one';
  group = 'collaborate';
  skipWorkspace = true;
  alias = '';
  options = [
    ['s', 'scope', 'default scope for the newly created component'],
    ['p', 'path <string>', 'relative path in the workspace. by default the path is `<scope>/<namespace>/<name>`'],
  ] as CommandOptions;
  loader = true;
  migration = true;
  remoteOp = true;

  constructor(private forker: Forker) {}

  async report([sourceId, targetId]: [string, string], options: ForkOptions): Promise<string> {
    const results = await this.forker.fork(sourceId, targetId, options);
    const targetIdStr = results.toString();
    return chalk.green(`successfully forked ${chalk.bold(targetIdStr)} from ${chalk.bold(sourceId)}`);
  }
}

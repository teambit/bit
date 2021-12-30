import chalk from 'chalk';
import { Command, CommandOptions } from '@teambit/cli';
import { RenamingMain } from '.';

export type RenameOptions = {
  scope?: string;
  path?: string;
};

export class RenameCmd implements Command {
  name = 'rename <source-id> <target-id>';
  description = 'EXPERIMENTAL. create a new target-component and deprecate the source-component';
  group = 'collaborate';
  skipWorkspace = true;
  alias = '';
  options = [
    ['s', 'scope <string>', 'default scope for the newly created component'],
    ['p', 'path <string>', 'relative path in the workspace. by default the path is `<scope>/<namespace>/<name>`'],
  ] as CommandOptions;
  loader = true;
  migration = true;
  remoteOp = true;

  constructor(private renaming: RenamingMain) {}

  async report([sourceId, targetId]: [string, string], options: RenameOptions): Promise<string> {
    const results = await this.renaming.rename(sourceId, targetId, options);
    return chalk.green(
      `successfully renamed ${chalk.bold(results.sourceId.toString())} to ${chalk.bold(results.targetId.toString())}`
    );
  }
}

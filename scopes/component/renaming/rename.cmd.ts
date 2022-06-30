import chalk from 'chalk';
import { Command, CommandOptions } from '@teambit/cli';
import { RenamingMain } from '.';

export type RenameOptions = {
  scope?: string;
  path?: string;
  refactor?: boolean;
};

export class RenameCmd implements Command {
  name = 'rename <current-name> <new-name>';
  description =
    'EXPERIMENTAL. rename component. if tagged/exported, create a new component and deprecate the original component';
  arguments = [
    {
      name: 'current-name',
      description: 'the current component name (without its scope name)',
    },
    {
      name: 'new-name',
      description: 'the new component name (without its scope name)',
    },
  ];
  group = 'collaborate';
  skipWorkspace = true;
  alias = '';
  options = [
    ['s', 'scope <scope-name>', 'default scope for the newly created component'],
    [
      'p',
      'path <relative-path>',
      'relative path in the workspace. by default the path is `<scope>/<namespace>/<name>`',
    ],
    ['r', 'refactor', 'update the import/require statements in all dependent components (in the same workspace)'],
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

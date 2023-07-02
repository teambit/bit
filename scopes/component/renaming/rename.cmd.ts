import chalk from 'chalk';
import { Command, CommandOptions } from '@teambit/cli';
import { RenamingMain } from '.';

export type RenameOptions = {
  scope?: string;
  path?: string;
  refactor?: boolean;
  preserve?: boolean;
};

export class RenameCmd implements Command {
  name = 'rename <current-name> <new-name>';
  description = 'rename component. if tagged/exported, create a new component and deprecate the original component';
  helpUrl = 'docs/components/renaming-components';
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
    ['', 'preserve', 'avoid renaming files and variables/classes according to the new component name'],
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

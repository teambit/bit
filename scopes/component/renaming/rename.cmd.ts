import chalk from 'chalk';
import { Command, CommandOptions } from '@teambit/cli';
import { RenamingMain } from './renaming.main.runtime';

export type RenameOptions = {
  scope?: string;
  path?: string;
  refactor?: boolean;
  preserve?: boolean;
  ast?: boolean;
  deprecate?: boolean;
};

export class RenameCmd implements Command {
  name = 'rename <current-name> <new-name>';
  description =
    'rename component. if exported, create a new component and delete the original component. otherwise just renames current component';
  helpUrl = 'reference/components/renaming-components';
  arguments = [
    {
      name: 'current-name',
      description: 'the current component name (without its scope name)',
    },
    {
      name: 'new-name',
      description: "the new component name (without its scope name. use --scope to define the new component's scope)",
    },
  ];
  group = 'collaborate';
  skipWorkspace = true;
  alias = '';
  options = [
    ['s', 'scope <scope-name>', 'define the scope for the new component'],
    ['r', 'refactor', 'update the import/require statements in all dependent components (in the same workspace)'],
    ['', 'preserve', 'avoid renaming files and variables/classes according to the new component name'],
    ['', 'ast', 'EXPERIMENTAL. use ast to transform files instead of regex'],
    ['', 'delete', 'DEPRECATED. this is now the default'],
    ['', 'deprecate', 'instead of deleting the original component, deprecating it'],
    [
      'p',
      'path <relative-path>',
      'relative path in the workspace to place new component in. by default, the directory of the new component is from your workspace\'s "defaultScope" value',
    ],
  ] as CommandOptions;
  loader = true;
  remoteOp = true;

  constructor(private renaming: RenamingMain) {}

  async report([sourceId, targetId]: [string, string], options: RenameOptions): Promise<string> {
    const results = await this.renaming.rename(sourceId, targetId, options);
    return chalk.green(
      `successfully renamed ${chalk.bold(results.sourceId.toString())} to ${chalk.bold(results.targetId.toString())}`
    );
  }
}

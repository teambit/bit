import { Command, CommandOptions } from '@teambit/cli';
import chalk from 'chalk';
import { RenamingMain } from './renaming.main.runtime';

export class ScopeRenameCmd implements Command {
  name = 'rename <current-scope-name> <new-scope-name>';
  description =
    "Renames the scope name for all components with the specified 'current scope name' - only available for new components that have not yet been snapped/tagged";
  extendedDescription = `Note: if <current-scope-name> is also the defaultScope for the workspace, this command will set <new-scope-name>
as the defaultScope instead, and that will then be set for all components by default. You may see updates in your .bitmap file
as a result of this change`;
  arguments = [
    { name: 'current-scope-name', description: 'the scope name to be replaced by another scope name' },
    { name: 'new-scope-name', description: 'a new scope name to replace the current scope name' },
  ];
  options = [
    [
      'r',
      'refactor',
      'update the import statements in all dependent components to the new package name (i.e. with the new scope name)',
    ],
  ] as CommandOptions;
  group = 'development';

  constructor(private renaming: RenamingMain) {}

  async report([oldName, newName]: [string, string], { refactor }: { refactor?: boolean }) {
    const { scopeRenamedComponentIds, refactoredIds } = await this.renaming.renameScope(oldName, newName, { refactor });
    const title = chalk.green(`successfully replaced "${oldName}" scope with "${newName}"`);
    const renamedIdsStr = scopeRenamedComponentIds.length
      ? `\n${chalk.bold(
          'the following components were affected by this scope-name change:'
        )}\n${scopeRenamedComponentIds.map((c) => c.changeScope(newName)).join('\n')}`
      : '';
    const refactoredStr = refactoredIds.length
      ? `\n\n${chalk.bold('the following components have been refactored:')}\n${refactoredIds.join('\n')}`
      : '';
    return `${title}\n${renamedIdsStr}${refactoredStr}`;
  }
}

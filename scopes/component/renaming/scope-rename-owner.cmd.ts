import { Command, CommandOptions } from '@teambit/cli';
import chalk from 'chalk';
import { RenamingMain } from './renaming.main.runtime';

export class ScopeRenameOwnerCmd implements Command {
  name = 'rename-owner <current-owner-name> <new-owner-name>';
  description = "Renames the owner part of the scope-name for all components with the specified 'current owner name'";
  arguments = [
    { name: 'current-owner-name', description: 'the owner name to be replaced by another owner name' },
    { name: 'new-owner-name', description: 'a new owner name to replace the current owner name' },
  ];
  options = [
    [
      'r',
      'refactor',
      'update the import statements in all dependent components to the new package name (that contains the new owner name)',
    ],
  ] as CommandOptions;
  group = 'development';

  constructor(private renaming: RenamingMain) {}

  async report([oldName, newName]: [string, string], { refactor }: { refactor?: boolean }) {
    const { scopeRenamedComponentIds, refactoredIds } = await this.renaming.renameOwner(oldName, newName, { refactor });
    const title = chalk.green(`successfully replaced "${oldName}" owner with "${newName}"`);
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

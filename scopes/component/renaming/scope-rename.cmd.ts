import { Command, CommandOptions } from '@teambit/cli';
import chalk from 'chalk';
import { RenamingMain } from './renaming.main.runtime';

export class ScopeRenameCmd implements Command {
  name = 'rename <current-scope-name> <new-scope-name>';
  description = "Renames the scope name for all components with the specified 'current scope name'";
  arguments = [
    { name: 'current-scope-name', description: 'the scope name to be replaced by another scope name' },
    { name: 'new-scope-name', description: 'a new scope name to replace the current scope name' },
  ];
  options = [
    ['r', 'refactor', 'change the source code of all components using the original scope-name with the new scope-name'],
  ] as CommandOptions;
  group = 'development';

  constructor(private renaming: RenamingMain) {}

  async report([oldName, newName]: [string, string], { refactor }: { refactor?: boolean }) {
    const { scopeRenamedComponentIds, refactoredIds } = await this.renaming.renameScope(oldName, newName, { refactor });
    const title = chalk.green(`successfully replaced "${oldName}" scope with "${newName}"`);
    const renamedIdsStr = scopeRenamedComponentIds.length
      ? `\n${chalk.bold(
          'the following components were affected by this scope-name change:'
        )}\n${scopeRenamedComponentIds.join('\n')}`
      : '';
    const refactoredStr = refactoredIds.length
      ? `\n\n${chalk.bold('the following components have been refactored:')}\n${refactoredIds.join('\n')}`
      : '';
    return `${title}\n${renamedIdsStr}${refactoredStr}`;
  }
}

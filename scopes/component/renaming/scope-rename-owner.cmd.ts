import type { Command, CommandOptions } from '@teambit/cli';
import chalk from 'chalk';
import type { RenamingMain } from './renaming.main.runtime';
import { renameScopeOutput } from './scope-rename.cmd';

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
    ['', 'ast', 'use ast to transform files instead of regex'],
  ] as CommandOptions;
  group = 'component-config';

  constructor(private renaming: RenamingMain) {}

  async report([oldName, newName]: [string, string], { refactor }: { refactor?: boolean }) {
    const results = await this.renaming.renameOwner(oldName, newName, { refactor });
    const title = chalk.green(`successfully replaced "${oldName}" owner with "${newName}"`);
    const renameOutput = renameScopeOutput(results);
    return `${title}\n${renameOutput}`;
  }
}

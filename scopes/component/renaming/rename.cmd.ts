import chalk from 'chalk';
import type { Command, CommandOptions } from '@teambit/cli';
import { formatSuccessSummary } from '@teambit/cli';
import type { RenamingMain } from './renaming.main.runtime';
import { renameCommand } from './renaming.commands';

export type RenameOptions = {
  scope?: string;
  path?: string;
  refactor?: boolean;
  preserve?: boolean;
  ast?: boolean;
  deprecate?: boolean;
  skipCompile?: boolean;
};

export class RenameCmd implements Command {
  name = renameCommand.name;
  description = renameCommand.description;
  extendedDescription = renameCommand.extendedDescription;
  helpUrl = renameCommand.helpUrl;
  arguments = renameCommand.arguments;
  group = renameCommand.group;
  skipWorkspace = renameCommand.skipWorkspace;
  alias = renameCommand.alias;
  options = renameCommand.options;
  loader = renameCommand.loader;
  remoteOp = renameCommand.remoteOp;

  constructor(private renaming: RenamingMain) {}

  async report([sourceId, targetId]: [string, string], options: RenameOptions): Promise<string> {
    const results = await this.renaming.rename(sourceId, targetId, options);
    return formatSuccessSummary(
      `renamed ${chalk.bold(results.sourceId.toString())} to ${chalk.bold(results.targetId.toString())}`
    );
  }
}

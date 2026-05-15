import chalk from 'chalk';
import yesno from 'yesno';
import type { Command, CommandOptions } from '@teambit/cli';
import type { Workspace } from '@teambit/workspace';
import { BitError } from '@teambit/bit-error';
import { COMPONENT_PATTERN_HELP } from '@teambit/legacy.constants';
import type { RemovedLocalObjects } from './removed-local-objects';
import type { RemoveMain } from './remove.main.runtime';
import { removeTemplate } from './remove-template';
import { removeCommand } from './remove.commands';

export class RemoveCmd implements Command {
  name = removeCommand.name;
  description = removeCommand.description;
  extendedDescription = removeCommand.extendedDescription;
  arguments = removeCommand.arguments;
  group = removeCommand.group;
  helpUrl = removeCommand.helpUrl;
  skipWorkspace = removeCommand.skipWorkspace;
  alias = removeCommand.alias;
  options = removeCommand.options;
  loader = removeCommand.loader;
  examples = removeCommand.examples;
  remoteOp = removeCommand.remoteOp;

  constructor(
    private remove: RemoveMain,
    private workspace?: Workspace
  ) {}

  async report(
    [componentsPattern]: [string],
    {
      force = false,
      track = false,
      silent = false,
      keepFiles = false,
    }: {
      force?: boolean;
      track?: boolean;
      silent?: boolean;
      keepFiles?: boolean;
    }
  ) {
    if (!silent) {
      await this.removePrompt(!keepFiles);
    }
    const {
      localResult,
    }: {
      localResult: RemovedLocalObjects;
    } = await this.remove.remove({ componentsPattern, force, track, deleteFiles: !keepFiles });
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const localMessage = removeTemplate(localResult, false);
    // if (localMessage !== '')
    //   localMessage +=
    //     '. Note: these components were not deleted from the remote - if you want to delete components run "bit delete"\n';
    return localMessage;
  }

  private async removePrompt(deleteFiles?: boolean) {
    this.remove.logger.clearStatusLine();
    const filesDeletionStr = deleteFiles
      ? ' and the files will be deleted from the filesystem (can be avoided by entering --keep-files)'
      : '';
    const ok = await yesno({
      question: `this command will remove the component/s only from your local workspace. if your intent is to delete the component/s also from the remote scope, refer to "bit delete".
the component(s) will be untracked${filesDeletionStr}.
${chalk.bold('Would you like to proceed? [yes(y)/no(n)]')}`,
    });
    if (!ok) {
      throw new BitError('the operation has been canceled');
    }
  }
}

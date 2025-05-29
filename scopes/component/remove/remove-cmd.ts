import chalk from 'chalk';
import yesno from 'yesno';
import { Command, CommandOptions } from '@teambit/cli';
import { Workspace } from '@teambit/workspace';
import { BitError } from '@teambit/bit-error';
import { COMPONENT_PATTERN_HELP } from '@teambit/legacy.constants';
import { RemovedLocalObjects } from './removed-local-objects';
import { RemoveMain } from './remove.main.runtime';
import { removeTemplate } from './remove-template';

export class RemoveCmd implements Command {
  name = 'remove <component-pattern>';
  description = 'remove component(s) from the local workspace';
  extendedDescription = `to mark components as deleted on the remote scope, use "bit delete".`;
  arguments = [
    {
      name: 'component-pattern',
      description: COMPONENT_PATTERN_HELP,
    },
  ];
  group = 'component-development';
  helpUrl = 'reference/components/removing-components';
  skipWorkspace = true;
  alias = 'rm';
  options = [
    ['t', 'track', 'keep tracking component in .bitmap (default = false), helps transform a tagged-component to new'],
    ['', 'keep-files', 'keep component files (just untrack the component)'],
    [
      'f',
      'force',
      'removes the component from the scope, even if used as a dependency. WARNING: you will need to fix the components that depend on this component',
    ],
    ['s', 'silent', 'skip confirmation'],
  ] as CommandOptions;
  loader = true;
  examples = [
    {
      cmd: 'remove "$deprecated"',
      description: 'remove all components that are deprecated',
    },
  ];
  remoteOp = true;

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

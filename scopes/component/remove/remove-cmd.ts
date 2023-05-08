import chalk from 'chalk';
import yn from 'yn';
import { Command, CommandOptions } from '@teambit/cli';
import { BitError } from '@teambit/bit-error';
import { removePrompt } from '@teambit/legacy/dist/prompts';
import RemovedObjects from '@teambit/legacy/dist/scope/removed-components';
import RemovedLocalObjects from '@teambit/legacy/dist/scope/removed-local-objects';
import paintRemoved from '@teambit/legacy/dist/cli/templates/remove-template';
import { COMPONENT_PATTERN_HELP } from '@teambit/legacy/dist/constants';
import { RemoveMain } from './remove.main.runtime';

export class RemoveCmd implements Command {
  name = 'remove <component-pattern>';
  description = 'remove component(s) from the workspace, or a remote scope';
  extendedDescription = `to remove components from your local workspace only, use "bit remove" (with no flags).

to remove a component from the remote scope, use "bit remove --delete", to mark the components as deleted.
once tagged/snapped and exported, the remote scope will be updated and it'll be marked as deleted there as well.
in case this is running on a lane, it'll mark the component as deleted on the lane only, which tells bit not to merge them. the main will not be affected.
`;
  arguments = [
    {
      name: 'component-pattern',
      description: COMPONENT_PATTERN_HELP,
    },
  ];
  group = 'collaborate';
  helpUrl = 'docs/components/removing-components';
  skipWorkspace = true;
  alias = 'rm';
  options = [
    ['', 'soft', 'DEPRECATED. use --delete instead'],
    ['', 'delete', 'mark the component as deleted. after tag/snap and export the remote will be updated'],
    ['', 'remote', 'DEPRECATED. use --hard instead'],
    [
      '',
      'hard',
      'remove a component completely from a remote scope. careful! this is a permanent change that could corrupt dependents. prefer --delete',
    ],
    ['', 'from-lane', 'revert to main if exists on currently checked out lane, otherwise, remove it'],
    ['t', 'track', 'keep tracking component in .bitmap (default = false), helps transform a tagged-component to new'],
    ['', 'keep-files', 'keep component files (just untrack the component)'],
    [
      'f',
      'force',
      'removes the component from the scope, even if used as a dependency. WARNING: components that depend on this component will corrupt',
    ],
    ['s', 'silent', 'skip confirmation'],
  ] as CommandOptions;
  loader = true;
  migration = true;
  remoteOp = true;

  constructor(private remove: RemoveMain) {}

  async report(
    [componentsPattern]: [string],
    {
      soft,
      delete: softDelete = false,
      force = false,
      remote,
      hard = false,
      fromLane = false,
      track = false,
      silent = false,
      keepFiles = false,
    }: {
      soft?: boolean;
      delete: boolean;
      force: boolean;
      remote?: boolean;
      hard: boolean;
      track: boolean;
      fromLane: boolean;
      silent: boolean;
      keepFiles: boolean;
    }
  ) {
    if (soft) {
      this.remove.logger.consoleWarning('--soft flag is deprecated. please use --delete instead');
      softDelete = true;
    }
    if (remote) {
      this.remove.logger.consoleWarning('--remote flag is deprecated. please use --hard instead');
      hard = true;
    }

    if (softDelete) {
      if (hard)
        throw new BitError(
          `error: --hard and --delete cannot be used together. soft delete can only be done locally, after tag/snap and export it updates the remote`
        );
      if (track) throw new BitError(`error: please use either --soft or --track, not both`);
      if (keepFiles) throw new BitError(`error: please use either --soft or --keep-files, not both`);
      if (fromLane) throw new BitError(`error: please use either --soft or --from-lane, not both`);
      const removedCompIds = await this.remove.softRemove(componentsPattern);
      return `${chalk.green('successfully soft-removed the following components:')}
${removedCompIds.join('\n')}

${chalk.bold('to update the remote, please tag/snap and then export. to revert, please use "bit recover"')}`;
    }

    if (!silent) {
      const willDeleteFiles = !hard && !keepFiles;
      const removePromptResult = await removePrompt(willDeleteFiles, hard)();
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      if (!yn(removePromptResult.shouldRemove)) {
        throw new BitError('the operation has been canceled');
      }
    }
    const {
      localResult,
      remoteResult = [],
    }: {
      localResult: RemovedLocalObjects;
      remoteResult: RemovedObjects[];
    } = await this.remove.remove({ componentsPattern, remote: hard, force, track, deleteFiles: !keepFiles, fromLane });
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return paintRemoved(localResult, false) + this.paintArray(remoteResult);
  }
  paintArray(removedObjectsArray: RemovedObjects[]) {
    return removedObjectsArray.map((item) => paintRemoved(item, true));
  }
}

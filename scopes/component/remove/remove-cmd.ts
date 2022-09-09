import chalk from 'chalk';
import yn from 'yn';
import { Command, CommandOptions } from '@teambit/cli';
import { BitError } from '@teambit/bit-error';
import { removePrompt } from '@teambit/legacy/dist/prompts';
import RemovedObjects from '@teambit/legacy/dist/scope/removed-components';
import RemovedLocalObjects from '@teambit/legacy/dist/scope/removed-local-objects';
import loader from '@teambit/legacy/dist/cli/loader';
import paintRemoved from '@teambit/legacy/dist/cli/templates/remove-template';
import { COMPONENT_PATTERN_HELP } from '@teambit/legacy/dist/constants';
import { RemoveMain } from './remove.main.runtime';

export class RemoveCmd implements Command {
  name = 'remove <component-pattern>';
  description = 'remove component(s) from the workspace, or a remote scope';
  arguments = [
    {
      name: 'component-pattern',
      description: COMPONENT_PATTERN_HELP,
    },
  ];
  group = 'collaborate';
  helpUrl = 'components/removing-components';
  skipWorkspace = true;
  alias = 'rm';
  options = [
    ['', 'soft', 'EXPERIMENTAL. mark the component as deleted. after tag/snap and export the remote will be updated'],
    [
      'r',
      'remote',
      'remove a component completely from a remote scope (Careful! this is a permanent change. prefer --soft and tag+export)',
    ],
    ['', 'from-lane', 'revert to main if exists on currently checked out lane, otherwise, remove it'],
    ['t', 'track', 'keep tracking component in .bitmap (default = false), helps transform a tagged-component to new'],
    ['d', 'delete-files', 'DEPRECATED (this is now the default). delete local component files'],
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
      soft = false,
      force = false,
      remote = false,
      fromLane = false,
      track = false,
      deleteFiles = false,
      silent = false,
      keepFiles = false,
    }: {
      force: boolean;
      remote: boolean;
      track: boolean;
      fromLane: boolean;
      deleteFiles: boolean;
      silent: boolean;
      keepFiles: boolean;
      soft: boolean;
    }
  ) {
    if (soft) {
      if (remote)
        throw new BitError(
          `error: --remote and --soft cannot be used together. soft delete can only be done locally, after tag/snap and export it updates the remote`
        );
      if (track) throw new BitError(`error: please use either --soft or --track, not both`);
      if (keepFiles) throw new BitError(`error: please use either --soft or --keep-files, not both`);
      if (fromLane) throw new BitError(`error: please use either --soft or --from-lane, not both`);
      const removedCompIds = await this.remove.softRemove(componentsPattern);
      return `${chalk.green('successfully soft-removed the following components:')}
${removedCompIds.join('\n')}

${chalk.bold('to update the remote, please tag/snap and then export')}`;
    }

    if (deleteFiles) {
      loader.stop();
      // eslint-disable-next-line no-console
      console.warn(
        chalk.yellow(
          '--delete-files flag is deprecated. by default the files are deleted, unless --keep-files was provided'
        )
      );
    }
    if (!silent) {
      const willDeleteFiles = !remote && !keepFiles;
      const removePromptResult = await removePrompt(willDeleteFiles, remote)();
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
    } = await this.remove.remove({ componentsPattern, remote, force, track, deleteFiles: !keepFiles, fromLane });
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return paintRemoved(localResult, false) + this.paintArray(remoteResult);
  }
  paintArray(removedObjectsArray: RemovedObjects[]) {
    return removedObjectsArray.map((item) => paintRemoved(item, true));
  }
}

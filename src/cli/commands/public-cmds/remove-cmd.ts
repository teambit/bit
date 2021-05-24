import chalk from 'chalk';
import yn from 'yn';
import { remove } from '../../../api/consumer';
import { BASE_DOCS_DOMAIN, WILDCARD_HELP } from '../../../constants';
import GeneralError from '../../../error/general-error';
import { removePrompt } from '../../../prompts';
import RemovedObjects from '../../../scope/removed-components';
import RemovedLocalObjects from '../../../scope/removed-local-objects';
import { Group } from '../../command-groups';
import { CommandOptions, LegacyCommand } from '../../legacy-command';
import paintRemoved from '../../templates/remove-template';

export default class Remove implements LegacyCommand {
  name = 'remove <ids...>';
  shortDescription = 'remove component(s) from your working area, or a remote scope';
  group: Group = 'collaborate';
  description = `remove a component (local/remote)
  https://${BASE_DOCS_DOMAIN}/docs/removing-components
  ${WILDCARD_HELP('remove')}`;
  skipWorkspace = true;
  alias = 'rm';
  opts = [
    ['r', 'remote', 'remove a component from a remote scope'],
    ['t', 'track [boolean]', 'keep tracking component (default = false)'],
    [
      'd',
      'delete-files [boolean]',
      'delete local component files (authored components only. for imported components the files are always deleted)',
    ],
    [
      'f',
      'force [boolean]',
      'removes the component from the scope, even if used as a dependency. WARNING: components that depend on this component will corrupt',
    ],
    ['s', 'silent [boolean]', 'skip confirmation'],
    ['', 'lane [boolean]', 'EXPERIMENTAL. remove a lane'],
  ] as CommandOptions;
  loader = true;
  migration = true;
  remoteOp = true;

  async action(
    [ids]: [string],
    {
      force = false,
      remote = false,
      track = false,
      deleteFiles = false,
      silent = false,
      lane = false,
    }: { force: boolean; remote: boolean; track: boolean; deleteFiles: boolean; silent: boolean; lane: boolean }
  ): Promise<any> {
    if (!silent) {
      const removePromptResult = await removePrompt();
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      if (!yn(removePromptResult.shouldRemove)) {
        throw new GeneralError('the operation has been canceled');
      }
    }
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return remove({ ids, remote, force, track, deleteFiles, lane });
  }
  report({
    localResult,
    remoteResult = [],
    laneResults = [],
  }: {
    localResult: RemovedLocalObjects;
    remoteResult: RemovedObjects[];
    laneResults: string[];
  }): string {
    if (laneResults.length) {
      return chalk.green(`successfully removed the following lane(s): ${chalk.bold(laneResults.join(', '))}`);
    }
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return paintRemoved(localResult, false) + this.paintArray(remoteResult);
  }
  paintArray(removedObjectsArray: RemovedObjects[]) {
    return removedObjectsArray.map((item) => paintRemoved(item, true));
  }
}

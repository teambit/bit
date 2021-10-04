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
    ['t', 'track', 'keep tracking component (default = false)'],
    [
      'd',
      'delete-files',
      'delete local component files (authored components only. for imported components the files are always deleted)',
    ],
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

  async action(
    [ids]: [string],
    {
      force = false,
      remote = false,
      track = false,
      deleteFiles = false,
      silent = false,
    }: { force: boolean; remote: boolean; track: boolean; deleteFiles: boolean; silent: boolean }
  ): Promise<any> {
    if (!silent) {
      const removePromptResult = await removePrompt();
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      if (!yn(removePromptResult.shouldRemove)) {
        throw new GeneralError('the operation has been canceled');
      }
    }
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return remove({ ids, remote, force, track, deleteFiles });
  }
  report({
    localResult,
    remoteResult = [],
  }: {
    localResult: RemovedLocalObjects;
    remoteResult: RemovedObjects[];
  }): string {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return paintRemoved(localResult, false) + this.paintArray(remoteResult);
  }
  paintArray(removedObjectsArray: RemovedObjects[]) {
    return removedObjectsArray.map((item) => paintRemoved(item, true));
  }
}

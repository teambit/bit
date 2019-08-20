/** @flow */
import yn from 'yn';
import Command from '../../command';
import { remove } from '../../../api/consumer';
import { RemovedObjects, RemovedLocalObjects } from '../../../scope/removed-components';
import paintRemoved from '../../templates/remove-template';
import { removePrompt } from '../../../prompts';
import { BASE_DOCS_DOMAIN, WILDCARD_HELP } from '../../../constants';
import GeneralError from '../../../error/general-error';

export default class Remove extends Command {
  name = 'remove <ids...>';
  description = `remove a component (local/remote)
  https://${BASE_DOCS_DOMAIN}/docs/removing-components.html
  ${WILDCARD_HELP('remove')}`;
  alias = 'rm';
  opts = [
    ['f', 'force [boolean]', 'force remove (default = false)'],
    ['r', 'remote', 'remove a component from a remote scope'],
    ['t', 'track [boolean]', 'keep tracking component (default = false)'],
    [
      'd',
      'delete-files [boolean]',
      'delete local component files (authored components only. for imported components the files are always deleted)'
    ],
    ['s', 'silent [boolean]', 'skip confirmation']
  ];
  loader = true;
  migration = true;

  async action(
    [ids]: [string],
    {
      force = false,
      remote = false,
      track = false,
      deleteFiles = false,
      silent = false
    }: { force: boolean, remote: boolean, track: boolean, deleteFiles: boolean, silent: boolean }
  ): Promise<any> {
    if (!silent) {
      const removePromptResult = await removePrompt();
      if (!yn(removePromptResult.shouldRemove)) {
        throw new GeneralError('the operation has been canceled');
      }
    }
    return remove({ ids, remote, force, track, deleteFiles });
  }
  report({
    localResult,
    remoteResult = []
  }: {
    localResult: RemovedLocalObjects,
    remoteResult: RemovedObjects[]
  }): string {
    return paintRemoved(localResult, false) + this.paintArray(remoteResult);
  }
  paintArray(removedObjectsArray: RemovedObjects[]) {
    // $FlowFixMe
    return removedObjectsArray.map(item => paintRemoved(item, true));
  }
}

/** @flow */
import yn from 'yn';
import Command from '../../command';
import { remove } from '../../../api/consumer';
import { RemovedObjects, RemovedLocalObjects } from '../../../scope/removed-components';
import paintRemoved from '../../templates/remove-template';
import { removePrompt } from '../../../prompts';
import { BASE_DOCS_DOMAIN } from '../../../constants';

export default class Remove extends Command {
  name = 'remove <ids...>';
  description = `remove a component (local/remote)\n  https://${BASE_DOCS_DOMAIN}/docs/removing-components.html`;
  alias = 'rm';
  opts = [
    ['f', 'force [boolean]', 'force remove (default = false)'],
    ['r', 'remote', 'remove a component from a remote scope'],
    ['t', 'track [boolean]', 'keep tracking component (default = false)'],
    ['d', 'delete-files [boolean]', 'delete local component files'],
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
        return Promise.reject('the operation has been canceled');
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
    return removedObjectsArray.map(item => paintRemoved(item, true));
  }
}

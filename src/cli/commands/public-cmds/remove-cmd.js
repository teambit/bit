/** @flow */
import yn from 'yn';
import Command from '../../command';
import { remove } from '../../../api/consumer';
import { RemovedObjects, RemovedLocalObjects } from '../../../scope/removed-components';
import paintRemoved from '../../templates/remove-template';
import { removePrompt } from '../../../prompts';

export default class Remove extends Command {
  name = 'remove <ids...>';
  description = 'remove a component (local/remote)';
  alias = 'rm';
  opts = [
    ['f', 'force [boolean]', 'force remove (default = false)'],
    ['t', 'track [boolean]', 'keep tracking component (default = false)'],
    ['d', 'delete-files [boolean]', 'delete local component files'],
    ['s', 'silent [boolean]', 'skip confirmation']
  ];
  loader = true;
  migration = true;

  action(
    [ids]: [string],
    {
      force = false,
      track = false,
      deleteFiles = false,
      silent = false
    }: { force: boolean, track: boolean, deleteFiles: boolean, silent: boolean }
  ): Promise<any> {
    if (!silent) {
      return removePrompt().then(({ shoudRemove }) => {
        if (yn(shoudRemove)) {
          return remove({ ids, force, track, deleteFiles });
        }
        return { localResult: new RemovedLocalObjects(), remoteResult: [] };
      });
    }
    return remove({ ids, force, track, deleteFiles });
  }
  report({
    localResult = new RemovedLocalObjects(),
    remoteResult = []
  }: {
    localResult: RemovedLocalObjects,
    remoteResult: RemovedObjects[]
  }): string {
    return paintRemoved(localResult) + this.paintArray(remoteResult);
  }
  paintArray(removedObjectsArray: RemovedObjects[]) {
    return removedObjectsArray.map(item => paintRemoved(item));
  }
}

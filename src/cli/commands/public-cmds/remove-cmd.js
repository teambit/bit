/** @flow */

import Command from '../../command';
import { remove } from '../../../api/consumer';
import { RemovedObjects, RemovedLocalObjects } from '../../../scope/component-remove.js';

export default class Remove extends Command {
  name = 'remove <ids...>';
  description = 'remove a component (local/remote)';
  alias = 'rm';
  opts = [
    ['f', 'force [boolean]', 'force remove (default = false)'],
    ['t', 'track [boolean]', 'keep tracking component (default = false) '],
    ['d', 'deleteFiles [boolean]', 'delete local component files']
  ];
  loader = true;
  migration = true;

  action(
    [ids]: [string],
    { force = false, track = false, deleteFiles = false }: { force: boolean, track: boolean, deleteFiles: boolean }
  ): Promise<any> {
    return remove({ ids, force, track, deleteFiles });
  }

  report({ localResult, remoteResult }: { localResult: RemovedLocalObjects, remoteResult: RemovedObjects }): string {
    return localResult.paintSingle() + this.paintArray(remoteResult);
  }
  paintArray(removedObjectsArray: RemovedObjects) {
    return removedObjectsArray.map(item => item.paintSingle());
  }
}

/** @flow */
import { loadScope } from '../../../scope';
import { BitIds } from '../../../bit-id';
import { PRE_REMOVE_REMOTE, POST_REMOVE_REMOTE } from '../../../constants';
import HooksManager from '../../../hooks';
import type { RemovedObjectSerialized } from '../../../scope/removed-components';

const HooksManagerInstance = HooksManager.getInstance();

export default function remove(
  { path, ids, force }: { path: string, ids: string[], force: boolean },
  headers: ?Object
): Promise<RemovedObjectSerialized> {
  const bitIds = BitIds.deserialize(ids);
  const args = { path, bitIds, force };
  HooksManagerInstance.triggerHook(PRE_REMOVE_REMOTE, args, headers);
  return loadScope(path).then((scope) => {
    return scope.removeMany(bitIds, force).then(async (res) => {
      const hookArgs = {
        removedComponentsIds: res.removedComponentIds.serialize(),
        missingComponentsIds: res.missingComponents.serialize(),
        dependentBitsIds: res.dependentBits,
        force,
        scopePath: path,
        componentsIds: bitIds.serialize(),
        scopeName: scope.scopeJson.name
      };
      await HooksManagerInstance.triggerHook(POST_REMOVE_REMOTE, hookArgs, headers);
      return res.serialize();
    });
  });
}

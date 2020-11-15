import { BitIds } from '../../../bit-id';
import { POST_REMOVE_REMOTE, PRE_REMOVE_REMOTE } from '../../../constants';
import HooksManager from '../../../hooks';
import { loadScope } from '../../../scope';
import RemovedObjects, { RemovedObjectSerialized } from '../../../scope/removed-components';

const HooksManagerInstance = HooksManager.getInstance();

export default async function remove(
  { path, ids, force, lanes }: { path: string; ids: string[]; force: boolean; lanes: boolean },
  headers?: Record<string, any>
): Promise<RemovedObjectSerialized> {
  const scope = await loadScope(path);
  if (lanes) {
    const removedLanes = await scope.lanes.removeLanes(scope, ids, force);
    const removedObjects = new RemovedObjects({ removedLanes });
    return removedObjects.serialize();
  }
  const bitIds = BitIds.deserialize(ids);
  const args = { path, bitIds, force };
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  HooksManagerInstance.triggerHook(PRE_REMOVE_REMOTE, args, headers);
  const res = await scope.removeMany(bitIds, force);
  const hookArgs = {
    removedComponentsIds: res.removedComponentIds.serialize(),
    missingComponentsIds: res.missingComponents.serialize(),
    dependentBitsIds: res.dependentBits,
    force,
    scopePath: path,
    componentsIds: bitIds.serialize(),
    scopeName: scope.scopeJson.name,
  };
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  await HooksManagerInstance.triggerHook(POST_REMOVE_REMOTE, hookArgs, headers);
  return res.serialize();
}

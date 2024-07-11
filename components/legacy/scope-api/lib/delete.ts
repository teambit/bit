import { ComponentIdList } from '@teambit/component-id';
import { POST_REMOVE_REMOTE, PRE_REMOVE_REMOTE } from '@teambit/legacy/dist/constants';
import { HooksManager } from '@teambit/legacy.hooks';
import { loadScope } from '@teambit/legacy/dist/scope';
import RemovedObjects, { RemovedObjectSerialized } from '@teambit/legacy/dist/scope/removed-components';

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
  const bitIds = ComponentIdList.fromStringArray(ids);
  const args = { path, bitIds, force };
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  HooksManagerInstance?.triggerHook(PRE_REMOVE_REMOTE, args, headers);
  const res = await scope.removeMany(bitIds, force);
  const hookArgs = {
    removedComponentsIds: res.removedComponentIds.toStringArray(),
    missingComponentsIds: res.missingComponents.toStringArray(),
    dependentBitsIds: res.dependentBits,
    force,
    scopePath: path,
    componentsIds: bitIds.toStringArray(),
    scopeName: scope.scopeJson.name,
  };
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  await HooksManagerInstance?.triggerHook(POST_REMOVE_REMOTE, hookArgs, headers);
  return res.serialize();
}

import R from 'ramda';
import { ComponentIdList } from '@teambit/component-id';
import { POST_RECEIVE_OBJECTS, PRE_RECEIVE_OBJECTS } from '@teambit/legacy/dist/constants';
import { HooksManager } from '@teambit/legacy.hooks';
import { loadScope } from '@teambit/legacy/dist/scope';
import { exportManyBareScope } from '@teambit/legacy/dist/scope/component-ops/export-scope-components';
import { ObjectList } from '@teambit/legacy/dist/scope/objects/object-list';

const HooksManagerInstance = HooksManager.getInstance();

export type ComponentObjectsInput = {
  path: string;
  objectList: string | ObjectList;
};

export type PushOptions = {
  clientId?: string; // timestamp in ms when the client started the request.
  persist?: boolean; // persist the objects immediately with no validation. (for legacy and bit-sign).
};

export async function put(
  { path, objectList }: ComponentObjectsInput,
  pushOptions: PushOptions,
  headers?: Record<string, any>
): Promise<string[]> {
  if (typeof objectList === 'string') {
    objectList = ObjectList.fromJsonString(objectList);
  }

  await HooksManagerInstance?.triggerHook(PRE_RECEIVE_OBJECTS, { path, objectList }, headers);
  const scope = await loadScope(path);
  if (pushOptions && pushOptions.clientId) {
    // harmony
    await scope.writeObjectsToPendingDir(objectList, pushOptions.clientId);
    return [];
  }
  // legacy client (non-harmony) or bit-sign.
  const componentsBitIds: ComponentIdList = await exportManyBareScope(scope, objectList);
  const componentsIds: string[] = componentsBitIds.map((id) => id.toString());
  let uniqComponentsIds = componentsIds;
  if (componentsIds && componentsIds.length) {
    uniqComponentsIds = R.uniq(componentsIds);
  }
  await HooksManagerInstance?.triggerHook(
    POST_RECEIVE_OBJECTS,
    {
      objectList,
      componentsIds: uniqComponentsIds,
      scopePath: path,
      scopeName: scope.scopeJson.name,
    },
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    headers
  );
  return componentsIds;
}

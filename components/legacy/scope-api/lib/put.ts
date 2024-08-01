import { ComponentIdList } from '@teambit/component-id';
import { loadScope } from '@teambit/legacy/dist/scope';
import { exportManyBareScope } from '@teambit/legacy/dist/scope/component-ops/export-scope-components';
import { ObjectList } from '@teambit/legacy/dist/scope/objects/object-list';

export type ComponentObjectsInput = {
  path: string;
  objectList: string | ObjectList;
};

export type PushOptions = {
  clientId?: string; // timestamp in ms when the client started the request.
  persist?: boolean; // persist the objects immediately with no validation. (for legacy and bit-sign).
};

export async function put({ path, objectList }: ComponentObjectsInput, pushOptions: PushOptions): Promise<string[]> {
  if (typeof objectList === 'string') {
    objectList = ObjectList.fromJsonString(objectList);
  }
  const scope = await loadScope(path);
  if (pushOptions && pushOptions.clientId) {
    // harmony
    await scope.writeObjectsToPendingDir(objectList, pushOptions.clientId);
    return [];
  }
  // legacy client (non-harmony) or bit-sign.
  const componentsBitIds: ComponentIdList = await exportManyBareScope(scope, objectList);
  const componentsIds: string[] = componentsBitIds.map((id) => id.toString());

  return componentsIds;
}

import R from 'ramda';

import BitIds from '../../../bit-id/bit-ids';
import { POST_RECEIVE_OBJECTS, PRE_RECEIVE_OBJECTS } from '../../../constants';
import HooksManager from '../../../hooks';
import { loadScope } from '../../../scope';
import { exportManyBareScope } from '../../../scope/component-ops/export-scope-components';
import { ObjectList } from '../../../scope/objects/object-list';

const HooksManagerInstance = HooksManager.getInstance();

export type ComponentObjectsInput = {
  path: string;
  objectList: string | ObjectList;
};

export default async function put(
  { path, objectList }: ComponentObjectsInput,
  headers?: Record<string, any>
): Promise<string[]> {
  if (typeof objectList === 'string') {
    objectList = ObjectList.fromJsonString(objectList);
  }

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  await HooksManagerInstance.triggerHook(PRE_RECEIVE_OBJECTS, { path, objectList }, headers);
  const scope = await loadScope(path);
  const componentsBitIds: BitIds = await exportManyBareScope(scope, objectList);
  const componentsIds: string[] = componentsBitIds.map((id) => id.toString());
  let uniqComponentsIds = componentsIds;
  if (componentsIds && componentsIds.length) {
    uniqComponentsIds = R.uniq(componentsIds);
  }
  await HooksManagerInstance.triggerHook(
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

/** @flow */
import { loadScope } from '../../../scope';
import { BitIds } from '../../../bit-id';
import { PRE_SEND_OBJECTS, POST_SEND_OBJECTS } from '../../../constants';
import HooksManager from '../../../hooks';
// import logger from '../../../logger/logger';

const HooksManagerInstance = HooksManager.getInstance();

export default (async function fetch(path: string, ids: string[], noDependencies: boolean = false, headers: ?Object) {
  const bitIds = BitIds.deserialize(ids);
  const args = { path, bitIds, noDependencies };
  let componentObjects;
  HooksManagerInstance.triggerHook(PRE_SEND_OBJECTS, args, headers);
  const scope = await loadScope(path);
  if (noDependencies) {
    componentObjects = await scope.manyOneObjects(bitIds);
  } else {
    componentObjects = await scope.getObjects(bitIds);
  }
  await HooksManagerInstance.triggerHook(
    POST_SEND_OBJECTS,
    {
      componentObjects,
      scopePath: path,
      componentsIds: bitIds.serialize(),
      scopeName: scope.scopeJson.name
    },
    headers
  );
  return componentObjects;
});

/** @flow */
import { loadScope, Scope } from '../../../scope';
import { BitIds } from '../../../bit-id';
import { PRE_SEND_OBJECTS, POST_SEND_OBJECTS } from '../../../constants';
import HooksManager from '../../../hooks';
// import logger from '../../../logger/logger';

const HooksManagerInstance = HooksManager.getInstance();

export default (async function fetch(path: string, ids: string[], noDependencies: boolean = false, headers: ?Object) {
  const bitIds: BitIds = BitIds.deserialize(ids);

  const args = { path, bitIds, noDependencies };
  // This might be undefined in case of fork process like during bit test command
  if (HooksManagerInstance) {
    HooksManagerInstance.triggerHook(PRE_SEND_OBJECTS, args, headers);
  }
  const scope: Scope = await loadScope(path);
  const componentObjects = noDependencies ? await scope.manyOneObjects(bitIds) : await scope.getObjects(bitIds);

  if (HooksManagerInstance) {
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
  }
  return componentObjects;
});

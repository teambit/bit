/** @flow */
import { loadScope } from '../../../scope';
import { BitIds } from '../../../bit-id';
import { PRE_SEND_OBJECTS, POST_SEND_OBJECTS } from '../../../constants';
import HooksManager from '../../../hooks';

const HooksManagerInstance = HooksManager.getInstance();

export default function fetch(path: string, ids: string[], noDependencies: boolean = false, headers: ?Object) {
  const bitIds = BitIds.deserialize(ids);
  const args = { path, bitIds, noDependencies };
  HooksManagerInstance.triggerHook(PRE_SEND_OBJECTS, args, headers);
  return loadScope(path).then((scope) => {
    if (noDependencies) return scope.manyOneObjects(bitIds);
    return scope.getObjects(bitIds).then((componentObjects) => {
      HooksManagerInstance.triggerHook(
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
  });
}

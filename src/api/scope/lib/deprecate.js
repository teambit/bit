// @flow
import { loadScope } from '../../../scope';
import { BitIds } from '../../../bit-id';
import { PRE_DEPRECATE_REMOTE, POST_DEPRECATE_REMOTE } from '../../../constants';
import HooksManager from '../../../hooks';

const HooksManagerInstance = HooksManager.getInstance();

export default function deprecate({ path, ids }): Promise<string[]> {
  const bitIds = BitIds.deserialize(ids);
  const args = { path, bitIds };
  HooksManagerInstance.triggerHook(PRE_DEPRECATE_REMOTE, args);
  return loadScope(path).then((scope) => {
    return scope.deprecateMany(bitIds).then((res) => {
      HooksManagerInstance.triggerHook(POST_DEPRECATE_REMOTE, {
        deprecatedComponentsIds: res.bitIds,
        missingComponentsIds: res.missingComponents,
        scopePath: path,
        componentsIds: bitIds.serialize(),
        scopeName: scope.scopeJson.name
      });
      return res;
    });
  });
}

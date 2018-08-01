// @flow
import { loadScope } from '../../../scope';
import { BitIds } from '../../../bit-id';
import { PRE_DEPRECATE_REMOTE, POST_DEPRECATE_REMOTE } from '../../../constants';
import HooksManager from '../../../hooks';

const HooksManagerInstance = HooksManager.getInstance();

export default function deprecate({ path, ids }: { path: string, ids: string[] }, headers: ?Object): Promise<string[]> {
  const bitIds = BitIds.deserialize(ids);
  const args = { path, bitIds };
  HooksManagerInstance.triggerHook(PRE_DEPRECATE_REMOTE, args, headers);
  return loadScope(path).then((scope) => {
    return scope.deprecateMany(bitIds).then(async (res) => {
      const hookArgs = {
        deprecatedComponentsIds: res.bitIds,
        missingComponentsIds: res.missingComponents.serialize(),
        scopePath: path,
        componentsIds: bitIds.serialize(),
        scopeName: scope.scopeJson.name
      };
      await HooksManagerInstance.triggerHook(POST_DEPRECATE_REMOTE, hookArgs, headers);
      return res;
    });
  });
}

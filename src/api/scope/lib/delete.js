// @flow
import { loadScope } from '../../../scope';
import { BitIds } from '../../../bit-id';
import { PRE_REMOVE_REMOTE, POST_REMOVE_REMOTE } from '../../../constants';
import HooksManager from '../../../hooks';

const HooksManagerInstance = HooksManager.getInstance();

export default function remove({ path, ids, force }, headers: ?Object): Promise<string[]> {
  const bitIds = BitIds.deserialize(ids);
  const args = { path, bitIds, force };
  HooksManagerInstance.triggerHook(PRE_REMOVE_REMOTE, args, headers);
  return loadScope(path).then((scope) => {
    return scope.removeMany(bitIds, force).then(async (res) => {
      await HooksManagerInstance.triggerHook(
        POST_REMOVE_REMOTE,
        {
          removedComponentsIds: res.bitIds,
          missingComponentsIds: res.missingComponents,
          dependentBitsIds: res.dependentBits,
          force,
          scopePath: path,
          componentsIds: bitIds.serialize(),
          scopeName: scope.scopeJson.name
        },
        headers
      );
      return res;
    });
  });
}

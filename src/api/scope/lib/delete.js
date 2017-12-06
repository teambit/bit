// @flow
import { loadScope } from '../../../scope';
import { BitIds } from '../../../bit-id';
import { PRE_REMOVE_REMOTE, POST_REMOVE_REMOTE } from '../../../constants';
import HooksManager from '../../../hooks';

const HooksManagerInstance = HooksManager.getInstance();

export default function remove({ path, ids, force }): Promise<string[]> {
  const bitIds = BitIds.deserialize(ids);
  const args = { path, bitIds };
  HooksManagerInstance.triggerHook(PRE_REMOVE_REMOTE, args);
  return loadScope(path).then((scope) => {
    return scope.removeMany(bitIds, force).then((res) => {
      HooksManagerInstance.triggerHook(POST_REMOVE_REMOTE, res);
      return res;
    });
  });
}

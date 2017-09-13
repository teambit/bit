// @flow
import { loadScope } from '../../../scope';
import BitId from '../../../bit-id/bit-id';

export default function remove({ path, bitIds, hard, force }): Promise<string[]> {
  const ids = bitIds.map(bitId => BitId.parse(bitId));
  return loadScope(path).then((scope) => {
    return scope.removeMany(ids, hard, force);
  });
}

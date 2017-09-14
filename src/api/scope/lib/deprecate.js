// @flow
import { loadScope } from '../../../scope';
import BitId from '../../../bit-id/bit-id';

export default function remove({ path, bitIds }): Promise<string[]> {
  const ids = bitIds.map(bitId => BitId.parse(bitId));
  return loadScope(path).then((scope) => {
    return scope.softRemoveMany(ids);
  });
}

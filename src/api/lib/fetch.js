/** @flow */
import { BitIds } from '../../bit-id';
import { loadScope } from '../../scope';

export default function fetch(path: string, ids: string[]) {
  return loadScope(path).then((scope) => {
    // const bitIds = ids.map(id => BitId.parse(id));
    return scope.fetch(BitIds.deserialize(ids).map((bitId) => {
      return bitId;
    }));
  });
}

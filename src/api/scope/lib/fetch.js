/** @flow */
import { loadScope } from '../../../scope';
import { BitIds } from '../../../bit-id';

export default function fetch(path: string, ids: string[], noDependencies: bool = false) {
  return loadScope(path)
    .then((scope) => {
      const bitIds = BitIds.deserialize(ids);
      if (noDependencies) return scope.manyOneObjects(bitIds);
      return scope.getObjects(bitIds);
    });
}

/** @flow */
import { BitIds } from '../../bit-id';
import { flatten } from '../../utils';
import { loadScope } from '../../scope';

export default function fetch(path: string, ids: string[]) {
  return loadScope(path)
    .then((scope) => {
      return scope.getMany(BitIds.deserialize(ids))
        .then(bitsMatrix => flatten(bitsMatrix))
        .then(bitDeps => Promise.all(bitDeps.map(bitDep => bitDep.serialize())))
        .then(serialized => [serialized, scope.name()]);
    });
}

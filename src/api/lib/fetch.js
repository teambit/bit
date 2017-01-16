/** @flow */
import { loadScope } from '../../scope';
import { BitIds } from '../../bit-id';

export default function fetch(path: string, ids: string[]) {
  return loadScope(path)
    .then(scope => scope.getManyObjects(BitIds.deserialize(ids)));
}

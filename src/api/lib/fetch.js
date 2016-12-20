/** @flow */
import { BitIds } from '../../bit-id';
import { loadScope } from '../../scope';
import { LOCAL_SCOPE_NOTATION } from '../../constants';

export default function fetch(ids: string[]) {
  return loadScope().then((scope) => {
    // const bitIds = ids.map(id => BitId.parse(id));
    return scope.fetch(BitIds.deserialize(ids).map((bitId) => {
      bitId.scope = LOCAL_SCOPE_NOTATION;
      return bitId;
    }));
  });
}

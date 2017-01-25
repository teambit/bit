/** @flow */
import { loadScope } from '../../../scope';
import { BitId } from '../../../bit-id';

export default function buildInScope(id: string) {
  return loadScope().then((scope) => {
    const bitId = BitId.parse(id, scope.name);
    return scope.build(bitId);
  });
}

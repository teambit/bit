/** @flow */
import BitId from '../../bit-id';
import { loadScope } from '../../scope';

export default function fetch(ids: string[]) {
  const scope = loadScope();
  // const bitIds = ids.map(id => BitId.parse(id));
  return Promise.all(scope.fetch(ids));
}

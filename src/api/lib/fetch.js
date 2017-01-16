/** @flow */
import { loadScope } from '../../scope';

export default function fetch(path: string, ids: string[]) {
  return loadScope(path)
    .then(scope => scope.getManyObjects(ids));
}

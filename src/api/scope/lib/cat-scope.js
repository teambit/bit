/** @flow */
import { loadScope } from '../../../scope';
import componentObject from '../../../scope/models/component';

export default function catScope(path: string, full: bool): Promise<componentObject[]> {
  return loadScope(path)
  .then((scope) => {
    return full ? scope.objects.list() : scope.objects.listComponents();
  });
}

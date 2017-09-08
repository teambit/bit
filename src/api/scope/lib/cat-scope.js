/** @flow */
import { loadScope } from '../../../scope';
import Component from '../../../scope/models/component';
import BitObject from '../../../scope/objects/object';

export default function catScope(path: string, full: boolean): Promise<Component[] | BitObject[]> {
  return loadScope(path).then((scope) => {
    return full ? scope.objects.list() : scope.objects.listComponents();
  });
}

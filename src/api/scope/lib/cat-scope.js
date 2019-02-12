/** @flow */
import { loadScope, Scope } from '../../../scope';
import type ModelComponent from '../../../scope/models/model-component';
import BitObject from '../../../scope/objects/object';

export default (async function catScope(path: string, full: boolean): Promise<BitObject[] | ModelComponent[]> {
  const scope: Scope = await loadScope(path);
  // $FlowFixMe
  return full ? scope.objects.list() : scope.listComponentsIncludeSymlinks();
});

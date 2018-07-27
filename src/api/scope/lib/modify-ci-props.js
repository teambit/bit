/** @flow */
import { loadScope, Scope } from '../../../scope';
import { BitId } from '../../../bit-id';
import ConsumerComponent from '../../../consumer/component';

export default (async function modifyCIProps(path: string, id: string, ciProps: Object): Promise<any> {
  const scope: Scope = await loadScope(path);
  const bitId: BitId = await scope.getParsedId(id);
  const component: ConsumerComponent = await scope.loadComponent(bitId);
  return scope.sources.modifyCIProps({ source: component, ciProps });
});

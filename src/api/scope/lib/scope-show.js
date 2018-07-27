/** @flow */
import { Scope, loadScope } from '../../../scope';
import { BitId } from '../../../bit-id';
import ConsumerComponent from '../../../consumer/component';

export default (async function list(path: string, id: string): Promise<any> {
  const scope: Scope = await loadScope(path);
  const bitId: BitId = await scope.getParsedId(id);
  const component: ConsumerComponent = await scope.loadComponent(bitId);
  return component.toString();
});

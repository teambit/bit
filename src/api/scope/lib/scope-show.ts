/** @flow */
import { Scope, loadScope } from '../../../scope';
import { BitId } from '../../../bit-id';
import type ConsumerComponent from '../../../consumer/component';
import ScopeComponentsImporter from '../../../scope/component-ops/scope-components-importer';

export default (async function list(path: string, id: string): Promise<any> {
  const scope: Scope = await loadScope(path);
  const bitId: BitId = await scope.getParsedId(id);
  const scopeComponentsImporter = ScopeComponentsImporter.getInstance(scope);
  const component: ConsumerComponent = await scopeComponentsImporter.loadComponent(bitId);
  return component.toString();
});

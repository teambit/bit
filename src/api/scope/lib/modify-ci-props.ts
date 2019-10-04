import { loadScope, Scope } from '../../../scope';
import { BitId } from '../../../bit-id';
import ConsumerComponent from '../../../consumer/component';
import ScopeComponentsImporter from '../../../scope/component-ops/scope-components-importer';

export default (async function modifyCIProps(path: string, id: string, ciProps: Object): Promise<any> {
  const scope: Scope = await loadScope(path);
  const bitId: BitId = await scope.getParsedId(id);
  const scopeComponentsImporter = ScopeComponentsImporter.getInstance(scope);
  const component: ConsumerComponent = await scopeComponentsImporter.loadComponent(bitId);
  return scope.sources.modifyCIProps({ source: component, ciProps });
});

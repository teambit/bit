import { BitId } from '../../../bit-id';
import ConsumerComponent from '../../../consumer/component';
import { loadScope, Scope } from '../../../scope';
import ScopeComponentsImporter from '../../../scope/component-ops/scope-components-importer';

export default (async function modifyCIProps(id: string, ciProps: Record<string, any>, path?: string): Promise<any> {
  const scope: Scope = await loadScope(path);
  const bitId: BitId = await scope.getParsedId(id);
  const scopeComponentsImporter = ScopeComponentsImporter.getInstance(scope);
  const component: ConsumerComponent = await scopeComponentsImporter.loadComponent(bitId);
  return scope.sources.modifyCIProps({ source: component, ciProps });
});

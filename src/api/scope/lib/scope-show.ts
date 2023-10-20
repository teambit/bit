import { ComponentID } from '@teambit/component-id';
import ConsumerComponent from '../../../consumer/component';
import { loadScope, Scope } from '../../../scope';

export default (async function list(path: string, id: string): Promise<any> {
  const scope: Scope = await loadScope(path);
  const bitId: ComponentID = await scope.getParsedId(id);
  const scopeComponentsImporter = scope.scopeImporter;
  const component: ConsumerComponent = await scopeComponentsImporter.loadComponent(bitId);
  return component.toString();
});

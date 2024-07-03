import { ComponentID } from '@teambit/component-id';
import { loadScope, Scope } from '@teambit/legacy/dist/scope';

export default (async function latestVersions(path: string, componentIdsStr: string[]): Promise<string[]> {
  const scope: Scope = await loadScope(path);
  const bitIds: ComponentID[] = await Promise.all(componentIdsStr.map((id) => scope.getParsedId(id)));
  const componentsIds = await scope.latestVersions(bitIds);
  return componentsIds.map((componentId) => componentId.toString());
});

import { BitId } from '../../../bit-id';
import { loadScope, Scope } from '../../../scope';

export default (async function latestVersions(path: string, componentIdsStr: string[]): Promise<string[]> {
  const scope: Scope = await loadScope(path);
  const bitIds: BitId[] = await Promise.all(componentIdsStr.map((id) => scope.getParsedId(id)));
  const componentsIds = await scope.latestVersions(bitIds);
  return componentsIds.map((componentId) => componentId.toString());
});

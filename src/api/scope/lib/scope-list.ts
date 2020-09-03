import ComponentsList, { ListScopeResult } from '../../../consumer/component/components-list';
import { loadScope } from '../../../scope';

export default function list(
  path: string,
  namespacesUsingWildcards?: string,
  loadScopeFromCache = true
): Promise<ListScopeResult[]> {
  return loadScope(path, loadScopeFromCache).then((scope) =>
    ComponentsList.listLocalScope(scope, namespacesUsingWildcards)
  );
}

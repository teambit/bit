import { loadScope } from '../../../scope';
import ComponentsList from '../../../consumer/component/components-list';
import { ListScopeResult } from '../../../consumer/component/components-list';

export default function list(
  path: string,
  namespacesUsingWildcards?: string,
  loadScopeFromCache = true
): Promise<ListScopeResult[]> {
  return loadScope(path, loadScopeFromCache).then(scope =>
    ComponentsList.listLocalScope(scope, namespacesUsingWildcards)
  );
}

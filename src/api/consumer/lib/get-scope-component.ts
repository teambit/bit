import { BitId } from '../../../bit-id';
import loader from '../../../cli/loader';
import { BEFORE_REMOTE_SHOW } from '../../../cli/loader/loader-messages';
import { Consumer, loadConsumerIfExist } from '../../../consumer';
import Component from '../../../consumer/component';
import getRemoteByName from '../../../remotes/get-remote-by-name';
import { loadScope, Scope } from '../../../scope';
import ScopeComponentsImporter from '../../../scope/component-ops/scope-components-importer';
import { DependenciesInfo } from '../../../scope/graph/scope-graph';

export default async function getScopeComponent({
  id,
  allVersions,
  scopePath,
  showDependents,
  showDependencies,
  loadScopeFromCache,
}: {
  id: string;
  allVersions?: boolean | null;
  scopePath?: string | null; // used by the api (see /src/api.js)
  showDependents?: boolean;
  showDependencies?: boolean;
  loadScopeFromCache?: boolean;
}): Promise<{ component: Component[] | Component }> {
  const bitId: BitId = BitId.parse(id, true); // user used --remote so we know it has a scope

  if (scopePath) {
    // coming from the api
    const scope: Scope = await loadScope(scopePath, loadScopeFromCache);
    const component = await showComponentUsingScope(scope);
    return { component };
  }

  const consumer: Consumer | undefined = await loadConsumerIfExist();
  const remote = await getRemoteByName(bitId.scope as string, consumer);
  loader.start(BEFORE_REMOTE_SHOW);
  const component = await remote.show(bitId);
  let dependenciesInfo: DependenciesInfo[] = [];
  let dependentsInfo: DependenciesInfo[] = [];
  if (showDependents || showDependencies) {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const componentDepGraph = await remote.graph(component.id);
    if (showDependents) {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      dependentsInfo = componentDepGraph.getDependentsInfo(component.id);
    }
    if (showDependencies) {
      // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
      dependenciesInfo = componentDepGraph.getDependenciesInfo(component.id);
    }
  }
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  return { component, dependentsInfo, dependenciesInfo };

  async function showComponentUsingScope(scope: Scope) {
    if (allVersions) {
      return scope.loadAllVersions(bitId);
    }
    const scopeComponentsImporter = ScopeComponentsImporter.getInstance(scope);
    return scopeComponentsImporter.loadRemoteComponent(bitId);
  }
}

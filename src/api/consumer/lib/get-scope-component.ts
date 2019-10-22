import { loadScope, Scope } from '../../../scope';
import { BitId } from '../../../bit-id';
import loader from '../../../cli/loader';
import { BEFORE_REMOTE_SHOW } from '../../../cli/loader/loader-messages';
import Remotes from '../../../remotes/remotes';
import Remote from '../../../remotes/remote';
import Component from '../../../consumer/component';
import { loadConsumerIfExist, Consumer } from '../../../consumer';
import { getScopeRemotes } from '../../../scope/scope-remotes';
import ScopeComponentsImporter from '../../../scope/component-ops/scope-components-importer';
import { DependenciesInfo } from '../../../scope/graph/scope-graph';

export default (async function getScopeComponent({
  id,
  allVersions,
  scopePath,
  showDependents,
  showDependencies
}: {
  id: string;
  allVersions: boolean | null | undefined;
  scopePath: string | null | undefined; // used by the api (see /src/api.js)
  showDependents: boolean;
  showDependencies: boolean;
}): Promise<{ component: Component[] | Component }> {
  const bitId: BitId = BitId.parse(id, true); // user used --remote so we know it has a scope

  if (scopePath) {
    // coming from the api
    const scope: Scope = await loadScope(scopePath);
    const component = await showComponentUsingScope(scope);
    return { component };
  }

  const consumer: Consumer | null | undefined = await loadConsumerIfExist();
  const remote = await getRemote();
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

  async function getRemote(): Promise<Remote> {
    // $FlowFixMe scope must be set as it came from a remote
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const scopeName: string = bitId.scope;
    if (consumer) {
      const remotes: Remotes = await getScopeRemotes(consumer.scope);
      return remotes.resolve(scopeName, consumer.scope);
    }
    return Remotes.getScopeRemote(scopeName);
  }
});

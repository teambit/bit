import loadScope from '../../scope-loader';
import { fetch, deprecate, undeprecate, remove, put } from '../../../api/scope';
import ComponentObjects from '../../component-objects';
import { BitIds, BitId } from '../../../bit-id';
import { FsScopeNotLoaded } from '../exceptions';
import { flatten } from '../../../utils';
import Scope, { ScopeDescriptor } from '../../scope';
import { searchAdapter } from '../../../search';
import { Network } from '../network';
import ComponentsList from '../../../consumer/component/components-list';
import { ListScopeResult } from '../../../consumer/component/components-list';
import ScopeComponentsImporter from '../../component-ops/scope-components-importer';
import DependencyGraph from '../../graph/scope-graph';
import { ComponentLogs } from '../../models/model-component';

export default class Fs implements Network {
  scopePath: string;
  scope: Scope | null | undefined;

  constructor(scopePath: string) {
    this.scopePath = scopePath;
  }

  close() {
    return this;
  }

  getScope(): Scope {
    if (!this.scope) throw new FsScopeNotLoaded();
    return this.scope;
  }

  describeScope(): Promise<ScopeDescriptor> {
    return Promise.resolve(this.getScope().describe());
  }

  push(componentObjects: ComponentObjects): Promise<string[]> {
    return this.pushMany([componentObjects]);
  }

  pushMany(components: ComponentObjects[]): Promise<string[]> {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return put({ path: this.scopePath, componentObjects: components });
  }

  deleteMany(ids: string[], force: boolean): Promise<ComponentObjects[]> {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return remove({ path: this.scopePath, ids, force });
  }

  deprecateMany(ids: string[]): Promise<ComponentObjects[]> {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return deprecate({ path: this.scopePath, ids });
  }

  undeprecateMany(ids: string[]): Promise<ComponentObjects[]> {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return undeprecate({ path: this.scopePath, ids });
  }

  fetch(bitIds: BitIds, noDependencies = false): Promise<ComponentObjects[]> {
    const idsStr = bitIds.serialize();
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return fetch(this.scopePath, idsStr, noDependencies).then(bitsMatrix => {
      if (noDependencies) return bitsMatrix;
      return flatten(bitsMatrix);
    });
  }

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  latestVersions(componentIds: BitId[]) {
    return this.getScope()
      .latestVersions(componentIds)
      .then(componentsIds => componentsIds.map(componentId => componentId.toString()));
  }

  list(namespacesUsingWildcards?: string): Promise<ListScopeResult[]> {
    return ComponentsList.listLocalScope(this.getScope(), namespacesUsingWildcards);
  }

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  search(query: string, reindex: boolean): Promise<[]> {
    return searchAdapter.scopeSearch(this.scopePath, query, reindex);
  }

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  show(bitId: BitId): Promise<> {
    const scopeComponentsImporter = ScopeComponentsImporter.getInstance(this.getScope());
    return scopeComponentsImporter.loadComponent(bitId);
  }

  log(bitId: BitId): Promise<ComponentLogs> {
    return this.getScope().loadComponentLogs(bitId);
  }

  async graph(bitId?: BitId): Promise<DependencyGraph> {
    const scope = this.getScope();
    const dependencyGraph = await DependencyGraph.loadLatest(scope);
    // get as string to mimic the exact steps of using ssh
    const getGraphAsString = (): object => {
      if (!bitId) {
        return dependencyGraph.serialize();
      }
      const componentGraph = dependencyGraph.getSubGraphOfConnectedComponents(bitId);
      return dependencyGraph.serialize(componentGraph);
    };
    const graphStr = getGraphAsString();
    return DependencyGraph.loadFromString(graphStr);
  }

  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  connect() {
    return loadScope(this.scopePath).then(scope => {
      this.scope = scope;
      return this;
    });
  }
}

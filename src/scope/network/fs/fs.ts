/** @flow */
import loadScope from '../../scope-loader';
import { fetch, deprecate, undeprecate, remove, put } from '../../../api/scope';
import ComponentObjects from '../../component-objects';
import { BitIds, BitId } from '../../../bit-id';
import { FsScopeNotLoaded } from '../exceptions';
import { flatten } from '../../../utils';
import type Scope, { ScopeDescriptor } from '../../scope';
import { searchAdapter } from '../../../search';
import type { Network } from '../network';
import ComponentsList from '../../../consumer/component/components-list';
import type { ListScopeResult } from '../../../consumer/component/components-list';
import ScopeComponentsImporter from '../../component-ops/scope-components-importer';
import DependencyGraph from '../../graph/scope-graph';

export default class Fs implements Network {
  scopePath: string;
  scope: ?Scope;

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
    return put({ path: this.scopePath, componentObjects: components });
  }

  deleteMany(ids: string[], force: boolean): Promise<ComponentObjects[]> {
    return remove({ path: this.scopePath, ids, force });
  }

  deprecateMany(ids: string[]): Promise<ComponentObjects[]> {
    return deprecate({ path: this.scopePath, ids });
  }

  undeprecateMany(ids: string[]): Promise<ComponentObjects[]> {
    return undeprecate({ path: this.scopePath, ids });
  }

  fetch(bitIds: BitIds, noDependencies: boolean = false): Promise<ComponentObjects[]> {
    const idsStr = bitIds.serialize();
    return fetch(this.scopePath, idsStr, noDependencies).then((bitsMatrix) => {
      if (noDependencies) return bitsMatrix;
      return flatten(bitsMatrix);
    });
  }

  latestVersions(componentIds: BitId[]) {
    return this.getScope()
      .latestVersions(componentIds)
      .then(componentsIds => componentsIds.map(componentId => componentId.toString()));
  }

  list(namespacesUsingWildcards?: string): Promise<ListScopeResult[]> {
    return ComponentsList.listLocalScope(this.getScope(), namespacesUsingWildcards);
  }

  search(query: string, reindex: boolean): Promise<[]> {
    return searchAdapter.scopeSearch(this.scopePath, query, reindex);
  }

  show(bitId: BitId): Promise<> {
    const scopeComponentsImporter = ScopeComponentsImporter.getInstance(this.getScope());
    return scopeComponentsImporter.loadComponent(bitId);
  }

  async graph(bitId?: BitId): Promise<DependencyGraph> {
    const scope = this.getScope();
    const dependencyGraph = await DependencyGraph.loadLatest(scope);
    // get as string to mimic the exact steps of using ssh
    const getGraphAsString = (): string => {
      if (!bitId) {
        return dependencyGraph.serialize();
      }
      const componentGraph = dependencyGraph.getSubGraphOfConnectedComponents(bitId);
      return dependencyGraph.serialize(componentGraph);
    };
    const graphStr = getGraphAsString();
    return DependencyGraph.loadFromString(graphStr);
  }

  connect() {
    return loadScope(this.scopePath).then((scope) => {
      this.scope = scope;
      return this;
    });
  }
}

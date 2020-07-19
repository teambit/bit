import loadScope from '../../scope-loader';
import { fetch, deprecate, undeprecate, remove, put } from '../../../api/scope';
import ComponentObjects from '../../component-objects';
import { BitId } from '../../../bit-id';
import { FsScopeNotLoaded } from '../exceptions';
import Scope, { ScopeDescriptor } from '../../scope';
import { searchAdapter } from '../../../search';
import { Network } from '../network';
import ComponentsList from '../../../consumer/component/components-list';
import { ListScopeResult } from '../../../consumer/component/components-list';
import ScopeComponentsImporter from '../../component-ops/scope-components-importer';
import DependencyGraph from '../../graph/scope-graph';
import { ComponentLogs } from '../../models/model-component';
import { LaneData } from '../../lanes/lanes';
import CompsAndLanesObjects from '../../comps-and-lanes-objects';
import { RemoteLaneId } from '../../../lane-id/lane-id';
import Component from '../../../consumer/component/consumer-component';

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
    return put({ path: this.scopePath, compsAndLanesObjects: components });
  }

  deleteMany(
    ids: string[],
    force: boolean,
    context: Record<string, any>,
    idsAreLanes?: boolean
  ): Promise<ComponentObjects[]> {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return remove({ path: this.scopePath, ids, force, lanes: idsAreLanes });
  }

  deprecateMany(ids: string[]): Promise<ComponentObjects[]> {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return deprecate({ path: this.scopePath, ids });
  }

  undeprecateMany(ids: string[]): Promise<ComponentObjects[]> {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return undeprecate({ path: this.scopePath, ids });
  }

  fetch(ids: Array<BitId | RemoteLaneId>, noDependencies = false, idsAreLanes = false): Promise<CompsAndLanesObjects> {
    const idsStr = ids.map((id) => id.toString());
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return fetch(this.scopePath, idsStr, noDependencies, idsAreLanes).then((bitsMatrix) => {
      // if (noDependencies) return bitsMatrix;
      // return flatten(bitsMatrix); // todo: check when this flatten is needed
      return bitsMatrix;
    });
  }

  latestVersions(componentIds: BitId[]): Promise<string[]> {
    return this.getScope()
      .latestVersions(componentIds)
      .then((componentsIds) => componentsIds.map((componentId) => componentId.toString()));
  }

  list(namespacesUsingWildcards?: string): Promise<ListScopeResult[]> {
    return ComponentsList.listLocalScope(this.getScope(), namespacesUsingWildcards);
  }

  search(query: string, reindex: boolean): Promise<string> {
    return searchAdapter.scopeSearch(this.scopePath, query, reindex);
  }

  show(bitId: BitId): Promise<Component> {
    const scopeComponentsImporter = ScopeComponentsImporter.getInstance(this.getScope());
    return scopeComponentsImporter.loadComponent(bitId);
  }

  log(bitId: BitId): Promise<ComponentLogs> {
    return this.getScope().loadComponentLogs(bitId);
  }

  listLanes(name?: string, mergeData?: boolean): Promise<LaneData[]> {
    return this.getScope().lanes.getLanesData(this.getScope(), name, mergeData);
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

  connect(): Promise<Fs> {
    return loadScope(this.scopePath).then((scope) => {
      this.scope = scope;
      return this;
    });
  }
}

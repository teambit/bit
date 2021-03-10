import { deprecate, fetch, put, remove, undeprecate } from '../../../api/scope';
import { action } from '../../../api/scope/lib/action';
import { FETCH_OPTIONS } from '../../../api/scope/lib/fetch';
import { PushOptions } from '../../../api/scope/lib/put';
import { BitId } from '../../../bit-id';
import ComponentsList, { ListScopeResult } from '../../../consumer/component/components-list';
import Component from '../../../consumer/component/consumer-component';
import ComponentObjects from '../../component-objects';
import ScopeComponentsImporter from '../../component-ops/scope-components-importer';
import DependencyGraph from '../../graph/scope-graph';
import { LaneData } from '../../lanes/lanes';
import { ComponentLog } from '../../models/model-component';
import { ObjectItemsStream, ObjectList } from '../../objects/object-list';
import Scope, { ScopeDescriptor } from '../../scope';
import loadScope from '../../scope-loader';
import { FsScopeNotLoaded } from '../exceptions';
import { Network } from '../network';

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

  pushMany(objectList: ObjectList, pushOptions: PushOptions): Promise<string[]> {
    return put({ path: this.scopePath, objectList }, pushOptions);
  }

  action<Options, Result>(name: string, options: Options): Promise<Result> {
    return action(this.scopePath, name, options);
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

  async fetch(ids: string[], fetchOptions: FETCH_OPTIONS): Promise<ObjectItemsStream> {
    const objectsReadable = await fetch(this.scopePath, ids, fetchOptions);
    return objectsReadable;
  }

  latestVersions(componentIds: BitId[]): Promise<string[]> {
    return this.getScope()
      .latestVersions(componentIds)
      .then((componentsIds) => componentsIds.map((componentId) => componentId.toString()));
  }

  list(namespacesUsingWildcards?: string): Promise<ListScopeResult[]> {
    return ComponentsList.listLocalScope(this.getScope(), namespacesUsingWildcards);
  }

  show(bitId: BitId): Promise<Component> {
    const scopeComponentsImporter = ScopeComponentsImporter.getInstance(this.getScope());
    return scopeComponentsImporter.loadComponent(bitId);
  }

  log(bitId: BitId): Promise<ComponentLog[]> {
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

  async connect(): Promise<Fs> {
    return loadScope(this.scopePath).then((scope) => {
      this.scope = scope;
      return this;
    });
  }
}

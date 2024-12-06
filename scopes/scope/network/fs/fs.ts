import { ComponentID } from '@teambit/component-id';
import { fetch, put, remove, action, FETCH_OPTIONS, PushOptions } from '@teambit/legacy.scope-api';
import { ComponentsList, ListScopeResult } from '@teambit/legacy.component-list';
import { ConsumerComponent as Component } from '@teambit/legacy.consumer-component';
import { DependencyGraph } from '@teambit/legacy.dependency-graph';
import { ComponentLog, ObjectItemsStream, ObjectList, Ref } from '@teambit/scope.objects';
import { RemovedObjects, LaneData, loadScope, Scope, ScopeDescriptor } from '@teambit/legacy.scope';
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
    // @ts-ignore for some reason, it finds two different ObjectList. try to remove it once all legacy are gone
    return put({ path: this.scopePath, objectList }, pushOptions);
  }

  action<Options extends Record<string, any>, Result>(name: string, options: Options): Promise<Result> {
    return action(this.scopePath, name, options);
  }

  async deleteMany(
    ids: string[],
    force: boolean,
    context: Record<string, any>,
    idsAreLanes = false
  ): Promise<RemovedObjects> {
    const result = await remove({ path: this.scopePath, ids, force, lanes: idsAreLanes });
    return RemovedObjects.fromObjects(result);
  }

  async fetch(ids: string[], fetchOptions: FETCH_OPTIONS): Promise<ObjectItemsStream> {
    const objectsReadable = await fetch(this.scopePath, ids, fetchOptions);
    return objectsReadable;
  }

  latestVersions(componentIds: ComponentID[]): Promise<string[]> {
    return this.getScope()
      .latestVersions(componentIds)
      .then((componentsIds) => componentsIds.map((componentId) => componentId.toString()));
  }

  list(namespacesUsingWildcards?: string, includeDeleted = false): Promise<ListScopeResult[]> {
    // @ts-ignore todo: remove after deleting teambit.legacy
    return ComponentsList.listLocalScope(this.getScope(), namespacesUsingWildcards, includeDeleted);
  }

  show(bitId: ComponentID): Promise<Component> {
    const scopeComponentsImporter = this.getScope().scopeImporter;
    return scopeComponentsImporter.loadComponent(bitId);
  }

  log(bitId: ComponentID): Promise<ComponentLog[]> {
    return this.getScope().loadComponentLogs(bitId);
  }

  listLanes(name?: string, mergeData?: boolean): Promise<LaneData[]> {
    return this.getScope().lanes.getLanesData(this.getScope(), name, mergeData);
  }

  async graph(bitId?: ComponentID): Promise<DependencyGraph> {
    const scope = this.getScope();
    // @ts-ignore todo: fix after deleting teambit.legacy
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

  async hasObjects(hashes: string[]): Promise<string[]> {
    const results = await this.getScope().objects.hasMultiple(hashes.map((h) => Ref.from(h)));
    return results.map((result) => result.toString());
  }
}

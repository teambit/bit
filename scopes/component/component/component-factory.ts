import { Graph } from '@teambit/graph.cleargraph';
import { BitId } from '@teambit/legacy-bit-id';
import ConsumerComponent from '@teambit/legacy/dist/consumer/component';
import { CompIdGraph } from '@teambit/graph';
import type { ComponentLog } from '@teambit/legacy/dist/scope/models/model-component';
import type { AspectDefinition } from '@teambit/aspect-loader';
import { ComponentID } from '@teambit/component-id';
import { Component, InvalidComponent } from './component';
import { State } from './state';
import { Snap } from './snap';

export type ResolveAspectsOptions = FilterAspectsOptions & {
  throwOnError?: boolean
};

export type FilterAspectsOptions = {
  /**
   * Do not return results for the core aspects
   */
  excludeCore?: boolean;
  /**
   * Only return results for the provided list of ids
   */
  requestedOnly?: boolean;
  /**
   * Only return results for aspects that have a path to the specified runtime name
   */
  filterByRuntime?: boolean;
};

export interface ComponentFactory {
  /**
   * name of the component host.
   */
  name: string;

  /**
   * path to the component host.
   */
  path: string;

  isLegacy: boolean;

  /**
   * resolve a `string` component ID to an instance of a ComponentID.
   */
  resolveComponentId(id: string | ComponentID | BitId): Promise<ComponentID>;

  /**
   * resolve multiple `string` component ID to an instance of a ComponentID.
   */
  resolveMultipleComponentIds(ids: (string | ComponentID | BitId)[]): Promise<ComponentID[]>;

  /**
   * returns a component by ID.
   */
  get(id: ComponentID): Promise<Component | undefined>;

  /**
   * returns many components by ids.
   */
  getMany(ids: ComponentID[]): Promise<Component[]>;

  /**
   * returns many components by their legacy representation.
   */
  getManyByLegacy(components: ConsumerComponent[]): Promise<Component[]>;

  /**
   * get a component from a remote without importing it
   */
  getRemoteComponent?: (id: ComponentID) => Promise<Component>;

  /**
   * important - prefer using `getGraphIds()` if you don't need the component objects.
   * this method has a performance penalty. it must import all flattened-dependencies objects from the remotes.
   */
  getGraph(ids?: ComponentID[], shouldThrowOnMissingDep?: boolean): Promise<Graph<Component, string>>;

  /**
   * get graph of the given component-ids and all their dependencies (recursively/flattened).
   * the nodes are ComponentIds and is much faster than `this.getGraph()`.
   */
  getGraphIds(ids?: ComponentID[], shouldThrowOnMissingDep?: boolean): Promise<CompIdGraph>;

  getLogs(id: ComponentID, shortHash?: boolean, startsFrom?: string): Promise<ComponentLog[]>;

  /**
   * returns a specific state of a component by hash or semver.
   */
  getState(id: ComponentID, snapId: string): Promise<State>;

  /**
   * returns a specific snap of a component by hash.
   */
  getSnap(id: ComponentID, snapId: string): Promise<Snap>;

  /**
   * load aspects.
   * returns the loaded aspect ids including the loaded versions.
   */
  loadAspects: (ids: string[], throwOnError?: boolean, neededFor?: string) => Promise<string[]>;

  /**
   * Resolve dirs for aspects
   */
  resolveAspects: (
    runtimeName?: string,
    componentIds?: ComponentID[],
    opts?: ResolveAspectsOptions
  ) => Promise<AspectDefinition[]>;

  /**
   * list all components in the host.
   */
  list(filter?: { offset: number; limit: number }): Promise<Component[]>;

  /**
   * list invalid components, such as components with missing files on the fs.
   */
  listInvalid(): Promise<InvalidComponent[]>;

  listIds(): Promise<ComponentID[]>;

  /**
   * get component-ids matching the given pattern. a pattern can have multiple patterns separated by a comma.
   * it uses multimatch (https://www.npmjs.com/package/multimatch) package for the matching algorithm, which supports
   * (among others) negate character "!" to exclude ids. See the package page for more supported characters.
   */
  idsByPattern(pattern: string, throwForNoMatch?: boolean): Promise<ComponentID[]>;

  hasId(componentId: ComponentID): Promise<boolean>;

  /**
   * Check if the host has the id, if no, search for the id in inner host (for example, workspace will search in the scope)
   * @param componentId
   */
  hasIdNested(componentId: ComponentID, includeCache?: boolean): Promise<boolean>;

  /**
   * whether a component is not the same as its head.
   * for a new component, it'll return "true" as it has no head yet.
   * this is relevant for component from the workspace, where it can be locally changed. on the scope it's always false
   */
  isModified(component: Component): Promise<boolean>;

  /**
   * write the component to the filesystem when applicable (no-op for scope).
   * to change the component-path, specify the "rootPath", which should be a relative path inside the workspace.
   */
  write(component: Component, rootPath?: string): Promise<void>;

  /**
   * determine whether host should be the prior one in case multiple hosts persist.
   */
  priority?: boolean;
}

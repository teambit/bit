import { BitId } from '@teambit/legacy-bit-id';
import LegacyGraph from '@teambit/legacy/dist/scope/graph/graph';
import ConsumerComponent from '@teambit/legacy/dist/consumer/component';
import type { ComponentLog } from '@teambit/legacy/dist/scope/models/model-component';
import type { AspectDefinition } from '@teambit/aspect-loader';
import { ComponentID } from '@teambit/component-id';
import { Component } from './component';
import { State } from './state';
import { Snap } from './snap';

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
  get(
    id: ComponentID | string,
    withState?: boolean,
    consumerComponent?: ConsumerComponent
  ): Promise<Component | undefined>;

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

  getLegacyGraph(ids?: ComponentID[]): Promise<LegacyGraph>;

  getLogs(id: ComponentID): Promise<ComponentLog[]>;

  /**
   * returns a specific state of a component by hash or semver.
   */
  getState(id: ComponentID, snapId: string): Promise<State>;

  /**
   * returns a specific snap of a component by hash.
   */
  getSnap(id: ComponentID, snapId: string): Promise<Snap>;

  /**
   * load extension.
   */
  loadAspects: (ids: string[], throwOnError: boolean) => Promise<void>;

  /**
   * Resolve dirs for aspects
   */
  resolveAspects: (runtimeName?: string, componentIds?: ComponentID[]) => Promise<AspectDefinition[]>;

  /**
   * list all components in the host.
   */
  list(filter?: { offset: number; limit: number }): Promise<Component[]>;

  listIds(): Promise<ComponentID[]>;

  hasId(componentId: ComponentID): Promise<boolean>;

  /**
   * Check if the host has the id, if no, search for the id in inner host (for example, workspace will search in the scope)
   * @param componentId
   */
  hasIdNested(componentId: ComponentID, includeCache?: boolean): Promise<boolean>;

  /**
   * determine whether host should be the prior one in case multiple hosts persist.
   */
  priority?: boolean;
}

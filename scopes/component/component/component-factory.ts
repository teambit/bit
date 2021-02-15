import { BitId } from '@teambit/legacy-bit-id';
import LegacyGraph from 'bit-bin/dist/scope/graph/graph';
import ConsumerComponent from 'bit-bin/dist/consumer/component';
import type { ComponentLog } from 'bit-bin/dist/scope/models/model-component';
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
   * determine whether host should be the prior one in case multiple hosts persist.
   */
  priority?: boolean;
}

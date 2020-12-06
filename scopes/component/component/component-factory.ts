import { BitId } from 'bit-bin/dist/bit-id';
import ConsumerComponent from 'bit-bin/dist/consumer/component';

import { Component } from './component';
import { ComponentID } from './id';
import { State } from './state';

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
   * returns many components with a group of ids.
   */
  getMany(ids: ComponentID[]): Promise<Component[]>;

  /**
   * returns a specific state of a component by hash or semver.
   */
  getState(id: ComponentID, snapId: string): Promise<State>;

  /**
   * load extension.
   */
  loadAspects: (ids: string[], throwOnError: boolean) => Promise<void>;

  /**
   * list all components in the host.
   */
  list(filter?: { offset: number; limit: number }): Promise<Component[]>;

  /**
   * determine whether host should be the prior one in case multiple hosts persist.
   */
  priority?: boolean;
}

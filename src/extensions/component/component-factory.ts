import { Component } from './component';
import { ComponentID } from './id';
import { State } from './state';
import { ExtensionDataList } from '../../consumer/config';
import { BitId } from '../../bit-id';

export interface ComponentFactory {
  resolveComponentId(id: string | ComponentID | BitId): Promise<ComponentID>;

  /**
   * returns a component by ID.
   */
  get(id: ComponentID | string, withState?: boolean): Promise<Component | undefined>;

  /**
   * returns a specific state of a component by hash or semver.
   */
  getState(id: ComponentID, snapId: string): Promise<State>;

  /**
   * load extension.
   */
  loadExtensions: (extensions: ExtensionDataList) => Promise<void>;

  /**
   * list all components in the host.
   */
  list(): Component[];
}

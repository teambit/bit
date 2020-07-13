import { Component } from './component';
import { ComponentID } from './id';
import { State } from './state';
import { ExtensionDataList } from '../../consumer/config';

export interface ComponentFactory {
  /**
   * returns a component by ID.
   */
  get(id: ComponentID | string): Promise<Component | undefined>;

  /**
   * returns a specific state of a component by hash or semver.
   */
  getState(id: ComponentID, snapId: string): Promise<State>;

  /**
   * load extension.
   */
  loadExtensions: (extensions: ExtensionDataList) => Promise<void>;
}

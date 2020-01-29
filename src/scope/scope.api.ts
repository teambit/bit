import { default as LegacyScope } from './scope';
import { PersistOptions } from './types';
import { BitIds as ComponentsIds } from '../bit-id';
import { Component, ComponentID } from '../component';
import { ComponentHost } from '../shared-types';

// eslint-disable-next-line import/prefer-default-export
export class Scope implements ComponentHost {
  constructor(
    /**
     * legacy scope
     */
    readonly legacyScope?: LegacyScope
  ) {}

  // TODO: support lanes / other kind of objects
  /**
   * Will fetch a list of components into the current scope.
   * This will only fetch the object and won't write the files to the actual FS
   *
   * @param {ComponentsIds} ids list of ids to fetch
   */
  fetch(ids: ComponentsIds) {} // eslint-disable-line @typescript-eslint/no-unused-vars

  /**
   * This function will get a component and sealed it's current state into the scope
   *
   * @param {Component[]} components A list of components to seal with specific persist options (such as message and version number)
   * @param {PersistOptions} persistGeneralOptions General persistence options such as verbose
   */
  persist(components: Component[], options: PersistOptions) {} // eslint-disable-line @typescript-eslint/no-unused-vars

  /**
   * get a component from scope
   * @param id component ID
   */
  async get(id: string | ComponentID): Promise<Component | undefined> {
    const componentId = typeof id === 'string' ? ComponentID.fromString(id) : id;
    return undefined;
  }
}

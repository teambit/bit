import { Consumer } from '../consumer';
import { ComponentToPersist, PersistComponentsGeneralOptions } from './types';
import { BitIds as ComponentsIds } from 'bit-id';
import { PersistOptions } from 'ora';

// eslint-disable-next-line import/prefer-default-export
export class Scope {
  constructor(
    /**
     * legacy consumer
     */
    readonly consumer: Consumer
  ) {}

  // TODO: support lanes / other kind of objects
  /**
   * Will fetch a list of components into the current scope.
   * This will only fetch the object and won't write the files to the actual FS
   *
   * @param {ComponentsIds} ids list of ids to fetch
   */
  fetch(ids: ComponentsIds) {}

  /**
   * This function will get a component and sealed it's current state into the scope
   *
   * @param {Component[]} components A list of components to seal with specific persist options (such as message and version number)
   * @param {PersistOptions} persistGeneralOptions General persistence options such as verbose
   */
  persist(components: Component[], options: PersistOptions) {}
}

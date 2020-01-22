import { Hash } from 'crypto';
import ComponentConfig from './component-config';
import ComponentState from './component-state';
import { Author } from './types';
import { Version } from '../scope/models';

/**
 * `Snap` represents a sealed state of the component in the working tree.
 */
export default class Snap extends ComponentState {
  constructor(
    /**
     * configuration of the component.
     */
    readonly config: ComponentConfig,

    /**
     * hash of the component `Snap`.
     */
    hash: Hash,

    /**
     * author of the component `Snap`.
     */
    readonly author: Author,

    /**
     * message added by the `Snap` author.
     */
    readonly message: string,

    /**
     * Snap date.
     */
    readonly date: Date
  ) {
    super(config);
  }

  /**
   * Get a snap representation by a version from the scope
   *
   * @static
   * @param {Version} version
   * @returns {Snap}
   * @memberof Snap
   */
  static fromVersionModel(version: Version): Snap {}

  /**
   * dependency graph of the component current. ideally package dependencies would be also placed here.
   */
  get dependencyGraph() {
    // TODO: implement. - it's returning undefined because of lint doesn't allow empty getters
    return undefined;
  }
}

import ComponentConfig from './component-config';
import { Hash } from 'crypto';

/**
 * `Snap` represents the state of the component in the working tree.
 */
export default class Snap {
  constructor(
    /**
     * hash of the component `Snap`.
     */
    hash: Hash,

    /**
     * configuration of the component.
     */
    readonly config: ComponentConfig,

    /**
     * author of the component `Snap`.
     */
    readonly author: Author,

    /**
     * message added by the `Snap` author.
     */
    readonly message: string
  ) {}

  /**
   * dependency graph of the component current. ideally package dependencies would be also placed here.
   */
  get dependencyGraph() {}
}

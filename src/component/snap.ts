import ComponentConfig from './config';
import ComponentFS from './component-fs';
import { DependencyGraph } from './dependency-graph';
import Component from './component';
import State from './state';

export type Hash = string;

export type Author = {
  /**
   * author full name (for example: "Ran Mizrahi")
   */
  name: string;

  /**
   * author email in a proper format (e.g. "ran@bit.dev")
   */
  email: string;
};

/**
 * `Snap` represents a sealed state of the component in the working tree.
 */
export default class Snap {
  constructor(
    /**
     * date time of the snap.
     */
    readonly timestamp: Date,

    /**
     * parent snap
     */
    readonly parent: Snap,

    /**
     * author of the component `Snap`.
     */
    readonly author: Author,

    /**
     * message added by the `Snap` author.
     */
    readonly message: string,

    /**
     * component state
     */
    readonly state: State
  ) {}

  /**
   * hash of the snap.
   */
  get hash() {
    // eslint-disable-line @typescript-eslint/no-unused-vars
    return this.state.hash;
  }

  /**
   * create a snap from a component
   */
  static create(component: Component, author: Author, message = '') {
    return new Snap(new Date(), component.head, author, message, component.state);
  }
}

// eslint-disable-next-line import/no-cycle
import { Component } from '../component'; // todo: change to "import type" once babel supports it
import { Author } from '../types';

/**
 * `Snap` represents a sealed state of the component in the working tree.
 */
export class Snap {
  constructor(
    /**
     * hash of the snap.
     */
    readonly hash: string,

    /**
     * date time of the snap.
     */
    readonly timestamp: Date,

    /**
     * parent snap
     */
    readonly parents: Snap[],

    /**
     * author of the component `Snap`.
     */
    readonly author: Author,

    /**
     * message added by the `Snap` author.
     */
    readonly message: string
  ) {}
}

export default Snap;

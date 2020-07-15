import { Author } from './author';

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

import { Author } from './author';

export type SnapProps = {
  hash: string;
  timestamp: string;
  parents: SnapProps[];
  author: Author;
  message: string;
};

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

  static fromObject(snapObject: SnapProps) {
    const parents = snapObject.parents || [];

    return new Snap(
      snapObject.hash,
      new Date(parseInt(snapObject.timestamp)),
      parents.map((props) => Snap.fromObject(props)),
      snapObject.author,
      snapObject.message
    );
  }

  toObject(): SnapProps {
    return {
      timestamp: this.timestamp.getTime().toString(),
      hash: this.hash,
      author: this.author,
      message: this.message,
      parents: this.parents.map((snap) => snap.toObject()),
    };
  }
}

import { SemVer } from 'semver';
import { Snap, SnapProps } from '../snap';

export type TagProps = {
  version: string;
  snap: SnapProps;
};

/**
 * `Tag` provides a sematic reference to a specific state `Snap` in the working tree.
 */
export class Tag {
  constructor(
    /**
     * hash of the component `Snap`.
     */
    readonly snap: Snap,

    /**
     * sematic version of the snap.
     */
    readonly version: SemVer
  ) {}

  /**
   * create a plain tag object.
   */
  toObject(): TagProps {
    return {
      snap: this.snap.toObject(),
      version: this.version.raw,
    };
  }

  static fromObject(tag: TagProps) {
    return new Tag(Snap.fromObject(tag.snap), new SemVer(tag.version));
  }
}

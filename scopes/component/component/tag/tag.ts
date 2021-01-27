import { SemVer } from 'semver';

import { Snap, SnapProps } from '../snap';

export type TagProps = {
  hash: string;
  version: string;
  /**
   * @deprecated
   */
  snap: SnapProps;
};

/**
 * `Tag` provides a sematic reference to a specific state `Snap` in the working tree.
 */
export class Tag {
  constructor(
    /**
     * tag hash, can be used to load it by component-factory.getSnap
     */
    readonly hash: string,

    /**
     * sematic version of the snap.
     */
    readonly version: SemVer,

    /**
     * @deprecated to get a snap object, use component-factory.getSnap(this.hash);
     */
    readonly snap: Snap
  ) {}

  /**
   * create a plain tag object.
   */
  toObject(): TagProps {
    return {
      hash: this.hash,
      version: this.version.raw,
      snap: this.snap.toObject(),
    };
  }

  static fromObject(tag: TagProps) {
    return new Tag(tag.hash, new SemVer(tag.version), Snap.fromObject(tag.snap));
  }
}

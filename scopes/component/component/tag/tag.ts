import { SemVer } from 'semver';

export type TagProps = {
  hash: string;
  version: string;
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
    readonly version: SemVer
  ) {}

  /**
   * create a plain tag object.
   */
  toObject(): TagProps {
    return {
      hash: this.hash,
      version: this.version.raw,
    };
  }

  static fromObject(tag: TagProps) {
    return new Tag(tag.hash, new SemVer(tag.version));
  }
}

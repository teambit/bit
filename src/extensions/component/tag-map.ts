import { SemVer } from 'semver';
// import { CouldNotFindLatest } from './exceptions';
// eslint-disable-next-line import/no-cycle
import { Tag } from './tag';
import { Hash } from './hash';

export class TagMap extends Map<SemVer, Tag> {
  /**
   * get snap by hash.
   */
  byHash(hash: Hash) {
    const tag = Array.from(this.values()).find((currTag) => currTag.snap.hash === hash);
    return tag;
  }

  /**
   * get the latest semver from the tag map.
   */
  // getLatest(): string {
  //
  // const versions = this.toArray().map((tag) => tag.version.raw);
  // if (!latest) throw new CouldNotFindLatest(versions);
  // }

  /**
   * get an array of all tags.
   */
  toArray() {
    return Array.from(this.values());
  }

  static fromArray(tags: Tag[]) {
    const tuples: [SemVer, Tag][] = tags.map((tag) => [tag.version, tag]);
    return new TagMap(tuples);
  }

  static empty() {
    return new TagMap();
  }
}

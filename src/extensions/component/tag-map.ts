import { SemVer } from 'semver';
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

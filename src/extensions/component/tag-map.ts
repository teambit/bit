import { SemVer, rcompare } from 'semver';
import { CouldNotFindLatest } from './exceptions';
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
  getLatest(): string {
    const versions = this.toArray().map((tag) => tag.version.raw);
    const sortedVersions = versions.sort((a, b) => rcompare(a, b));
    if (!sortedVersions || !sortedVersions[0]) throw new CouldNotFindLatest(versions);
    return sortedVersions[0];
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

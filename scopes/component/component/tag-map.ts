import { getLatestVersion } from '@teambit/legacy/dist/utils/semver-helper';
import { SemVer } from 'semver';

import { CouldNotFindLatest } from './exceptions';
import { Hash } from './hash';
import { Tag } from './tag';

export class TagMap extends Map<SemVer, Tag> {
  /**
   * get snap by hash.
   */
  byHash(hash: Hash) {
    const tag = Array.from(this.values()).find((currTag) => currTag.hash === hash);
    return tag;
  }

  /**
   * Get a map that map snap hash to tag
   */
  getHashMap(): Map<Hash, Tag> {
    const res: Map<Hash, Tag> = new Map();
    this.forEach((tag: Tag) => {
      res.set(tag.hash, tag);
    });
    return res;
  }

  /**
   * get the latest semver from the tag map.
   */
  getLatest(): string {
    const versions = this.toArray().map((tag) => tag.version.raw);
    if (this.isEmpty()) throw new CouldNotFindLatest(versions);
    return getLatestVersion(versions);
  }

  isEmpty() {
    return this.size === 0;
  }

  /**
   * get an array of all tags.
   */
  toArray() {
    return Array.from(this.values());
  }

  byVersion(version: string): Tag | undefined {
    const versions = this.toArray().map((tag) => tag);
    return versions.find((tag) => tag.version.raw === version);
  }

  static fromArray(tags: Tag[]) {
    const tuples: [SemVer, Tag][] = tags.map((tag) => [tag.version, tag]);
    return new TagMap(tuples);
  }

  static empty() {
    return new TagMap();
  }
}

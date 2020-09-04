import { getValidVersionOrReleaseType, getLatestVersion } from 'bit-bin/dist/utils/semver-helper';
import { DEFAULT_BIT_VERSION, DEFAULT_BIT_RELEASE_TYPE } from 'bit-bin/dist/constants';
import { SemVer, ReleaseType, inc } from 'semver';

import { CouldNotFindLatest } from './exceptions';
import { Hash } from './hash';
// eslint-disable-next-line import/no-cycle
import { Tag } from './tag';

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
    if (this.isEmpty()) throw new CouldNotFindLatest(versions);
    return getLatestVersion(versions);
  }

  /**
   * get the next version depends on the user input.
   * if exact-version is used, return it.
   * otherwise, use the latest version and increment it according to the release-type.
   * if an unsupported release-type is entered, such as "prerelease", it throws.
   */
  getNext(exactVersionOrReleaseType: ReleaseType | string = DEFAULT_BIT_RELEASE_TYPE): string {
    const { exactVersion, releaseType } = getValidVersionOrReleaseType(exactVersionOrReleaseType);
    if (exactVersion) return exactVersion;
    if (this.isEmpty()) {
      // this is the first tag
      return DEFAULT_BIT_VERSION;
    }
    const latest = this.getLatest();
    const next = inc(latest, releaseType as ReleaseType);
    if (!next) {
      // should never happen
      throw new Error(`either ${latest} or ${releaseType} are semver invalid`);
    }
    return next;
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

  static fromArray(tags: Tag[]) {
    const tuples: [SemVer, Tag][] = tags.map((tag) => [tag.version, tag]);
    return new TagMap(tuples);
  }

  static empty() {
    return new TagMap();
  }
}

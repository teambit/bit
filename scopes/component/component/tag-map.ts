import { getLatestVersion } from '@teambit/legacy/dist/utils/semver-helper';
import { SemVer, maxSatisfying } from 'semver';

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
   * e.g.
   * {
   *   alpha: '1.0.0-alpha.5',
   *   dev: '2.2.4-dev.37
   * }
   */
  getPreReleaseLatestTags(): { [preRelease: string]: string } {
    const preReleaseTagsWithAllVersions = this.toArray().reduce((acc, current) => {
      const preReleases = current.version.prerelease;
      if (!preReleases.length) return acc;
      if (preReleases.length !== 2) {
        // it could be length 1, e.g. 1.0.0-0, we ignore it.
        // it could also be length > 2, e.g. 1.0.0-dev.1.alpha.1, we don't support it for now.
        return acc;
      }
      if (typeof preReleases[0] !== 'string') return acc;
      (acc[preReleases[0]] ||= []).push(current.version.raw);
      return acc;
    }, {});
    return Object.keys(preReleaseTagsWithAllVersions).reduce((acc, current) => {
      acc[current] = maxSatisfying<string>(preReleaseTagsWithAllVersions[current], '*', { includePrerelease: true });
      return acc;
    }, {});
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
  toArray(): Tag[] {
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

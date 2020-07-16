import { SemVer } from 'semver';
// eslint-disable-next-line import/no-cycle
import { Tag } from './tag';
import { Hash } from './hash';

export class TagMap extends Map<SemVer, Tag> {
  // byRange(range: Semver) {
  // }

  byHash(hash: Hash) {
    const tag = Array.from(this.values()).find(currTag => currTag.snap.hash === hash);
    return tag;
  }
}

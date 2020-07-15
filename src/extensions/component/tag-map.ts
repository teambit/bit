import { SemVer } from 'semver';
// eslint-disable-next-line import/no-cycle
import Snap from './snap'; // todo: change to "import type" once babel supports it

export default class TagMap extends Map<SemVer, Snap> {
  // byRange(range: Semver) {
  // }
}

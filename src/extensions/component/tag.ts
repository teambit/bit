import { SemVer } from 'semver';
import Snap from './snap';

/**
 * `Tag` provides a sematic reference to a specific state `Snap` in the working tree.
 */
export default class Tag {
  constructor(
    /**
     * hash of the component `Snap`.
     */
    readonly snap: Snap,

    /**
     * sematic version of the snap.
     */
    readonly version: SemVer
  ) {}
}

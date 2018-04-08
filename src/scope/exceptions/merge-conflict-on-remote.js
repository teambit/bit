/** @flow */
import AbstractError from '../../error/abstract-error';

export default class MergeConflictOnRemote extends AbstractError {
  id: string;
  code: number;
  versions: string[];

  constructor(id: string, versions: string[]) {
    super();
    this.code = 131;
    this.id = id;
    this.versions = versions;
  }
  makeAnonymous() {
    const clone = this.clone();
    clone.id = this.toHash(clone.id);
    clone.versions = clone.versions.map(this.toHash);
    return clone;
  }
}

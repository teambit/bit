/** @flow */
import AbstractError from '../../error/abstract-error';

export default class HashMismatch extends AbstractError {
  id: string;
  version: string;
  originalHash: string;
  currentHash: string;
  constructor(id: string, version: string, originalHash: string, currentHash: string) {
    super();
    this.id = id;
    this.version = version;
    this.originalHash = originalHash;
    this.currentHash = currentHash;
  }
  makeAnonymous() {
    const clone = this.clone();
    clone.id = this.toHash(clone.id);
    return clone;
  }
}

/** @flow */
import AbstractError from '../../../../error/abstract-error';

export default class InvalidVersion extends AbstractError {
  version: string;

  constructor(version: string) {
    super();
    this.version = version;
  }
  makeAnonymous() {
    const clone = this.clone();
    clone.version = this.toHash(clone.version);
    return clone;
  }
}

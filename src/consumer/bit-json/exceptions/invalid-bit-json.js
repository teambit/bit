/** @flow */
import AbstractError from '../../../error/abstract-error';

export default class InvalidBitJson extends AbstractError {
  path: string;

  constructor(path: string) {
    super();
    this.path = path;
  }

  makeAnonymous() {
    const clone = this.clone();
    clone.path = this.toHash(this.path);
    return clone;
  }
}

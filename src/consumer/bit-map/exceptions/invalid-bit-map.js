/** @flow */
import AbstractError from '../../../error/abstract-error';

export default class InvalidBitMap extends AbstractError {
  path: string;
  errorMessage: string;

  constructor(path: string, errorMessage: string) {
    super();
    this.path = path;
    this.errorMessage = errorMessage;
  }

  makeAnonymous() {
    const clone = this.clone();
    clone.path = this.toHash(clone.path);
    clone.errorMessage = this.toHash(clone.errorMessage);
    return clone;
  }
}

/** @flow */
import AbstractError from '../../../error/abstract-error';

export default class WriteToNpmrcError extends AbstractError {
  path: string;
  constructor(path: string) {
    super();
    this.path = path;
  }
  makeAnonymous() {
    const clone = this.clone();
    clone.path = this.toHash(clone.path);
    return clone;
  }
}

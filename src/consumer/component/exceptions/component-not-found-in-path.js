/** @flow */
import AbstractError from '../../../error/abstract-error';

export default class ComponentNotFoundInPath extends AbstractError {
  path: string;
  code: number;

  constructor(path: string) {
    super();
    this.code = 127;
    this.path = path;
  }
  makeAnonymous() {
    const clone = this.clone();
    clone.path = this.toHash(clone.path);
    return clone;
  }
}

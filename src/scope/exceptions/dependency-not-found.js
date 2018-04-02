/** @flow */
import AbstractError from '../../error/abstract-error';

export default class DependencyNotFound extends AbstractError {
  id: string;
  code: number;
  bitJsonPath: string;

  constructor(id: string) {
    super();
    this.code = 127;
    this.id = id;
  }
  makeAnonymous() {
    const clone = this.clone();
    clone.id = this.toHash(clone.id);
    return clone;
  }
}

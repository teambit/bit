/** @flow */
import AbstractError from '../../error/abstract-error';

export default class MergeConflict extends AbstractError {
  id: string;
  code: number;

  constructor(id: string) {
    super();
    this.code = 131;
    this.id = id;
  }
  makeAnonymous() {
    const clone = this.clone();
    clone.id = this.toHash(clone.id);
    return clone;
  }
}

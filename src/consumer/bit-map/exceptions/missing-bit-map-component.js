/** @flow */
import AbstractError from '../../../error/abstract-error';

export default class MissingBitMapComponent extends AbstractError {
  id: string;

  constructor(id: string) {
    super();
    this.id = id;
  }

  makeAnonymous() {
    const clone = this.clone();
    clone.id = this.toHash(clone.id.toString());
    return clone;
  }
}

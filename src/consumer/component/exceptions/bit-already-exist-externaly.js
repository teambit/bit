/** @flow */
import AbstractError from '../../../error/abstract-error';

export default class BitAlreadyExistExternalyError extends AbstractError {
  bitName: string;

  constructor(bitName: string) {
    super();
    this.bitName = bitName;
  }
  makeAnonymous() {
    const clone = this.clone();
    clone.bitName = this.toHash(clone.bitName);
    return clone;
  }
}

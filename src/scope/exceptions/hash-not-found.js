/** @flow */
import AbstractError from '../../error/abstract-error';

export default class HashNotFound extends AbstractError {
  hash: string;
  constructor(hash: string) {
    super();
    this.hash = hash;
  }
}

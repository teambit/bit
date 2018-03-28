/** @flow */

import copy from 'utils-copy-error';
import hash from 'string-hash';

export default class AbstractError extends Error {
  constructor() {
    super();
    this.name = this.constructor.name;
  }

  clone() {
    return copy(this);
  }

  makeAnonymous() {
    return this.clone();
  }

  toHash(str: string) {
    return hash(str);
  }
}

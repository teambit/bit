/** @flow */

import AbstractError from '../../error/abstract-error';

export default class ExtensionNameNotValid extends AbstractError {
  name: string;

  constructor(name: string) {
    super();
    this.name = name;
  }
  makeAnonymous() {
    const clone = this.clone();
    clone.name = this.toHash(clone.name);
    return clone;
  }
}

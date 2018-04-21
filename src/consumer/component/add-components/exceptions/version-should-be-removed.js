/** @flow */
import AbstractError from '../../../../error/abstract-error';

export default class VersionShouldBeRemoved extends AbstractError {
  id: string;
  constructor(id: string) {
    super();
    this.id = id;
  }
  makeAnonymous() {
    const clone = this.clone();
    clone.id = this.toHash(clone.id);
    return clone;
  }
}

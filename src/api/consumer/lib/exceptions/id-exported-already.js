/** @flow */
import AbstractError from '../../../../error/abstract-error';

export default class IdExportedAlready extends AbstractError {
  id: string;
  remote: string;

  constructor(id: string, remote: string) {
    super();
    this.id = id;
    this.remote = remote;
  }

  makeAnonymous() {
    const clone = this.clone();
    clone.id = this.toHash(clone.id);
    clone.remote = this.toHash(clone.remote);
    return clone;
  }
}

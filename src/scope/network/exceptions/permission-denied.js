/** @flow */
import AbstractError from '../../../error/abstract-error';

export default class PermissionDenied extends AbstractError {
  scope: string;

  constructor(scope: string) {
    super();
    this.scope = scope;
  }
  makeAnonymous() {
    const clone = this.clone();
    clone.scope = this.toHash(clone.scope);
    return clone;
  }
}

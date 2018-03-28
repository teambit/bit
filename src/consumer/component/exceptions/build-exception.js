/** @flow */
import AbstractError from '../../../error/abstract-error';

export default class BuildException extends AbstractError {
  id: string;
  message: string;
  stack: string;
  constructor(id: string, message?: string, stack?: string) {
    super();
    this.id = id;
    this.message = message || '';
    this.stack = stack || '';
  }
  makeAnonymous() {
    const clone = this.clone();
    clone.id = this.toHash(clone.id);
    return clone;
  }
}

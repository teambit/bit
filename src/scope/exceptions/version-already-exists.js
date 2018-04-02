/** @flow */
import AbstractError from '../../error/abstract-error';

export default class VersionAlreadyExists extends AbstractError {
  constructor(version: string, componentId: string) {
    super();
    this.version = version;
    this.componentId = componentId;
  }
  makeAnonymous() {
    const clone = this.clone();
    clone.componentId = this.toHash(clone.componentId);
    return clone;
  }
}

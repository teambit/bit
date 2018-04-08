/** @flow */
import AbstractError from '../../error/abstract-error';

export default class NewerVersionFound extends AbstractError {
  componentId: string;
  currentVersion: string;
  newestVersion: string;

  constructor(componentId: string, currentVersion: string, newestVersion: string) {
    super();
    this.name = 'NewerVersionFound';
    this.componentId = componentId;
    this.currentVersion = currentVersion;
    this.newestVersion = newestVersion;
  }
  makeAnonymous() {
    const clone = this.clone();
    clone.name = 'NewerVersionFound';
    clone.componentId = this.toHash(clone.componentId);
    clone.currentVersion = this.toHash(clone.currentVersion);
    clone.newestVersion = this.toHash(clone.newestVersion);
    return clone;
  }
}

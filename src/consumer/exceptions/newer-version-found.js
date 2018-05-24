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
    const clone = super.makeAnonymous();
    clone.name = 'NewerVersionFound';
    return clone;
  }
}

/** @flow */
import AbstractError from '../../../../error/abstract-error';

export default class PathsNotExist extends AbstractError {
  paths: string[];
  constructor(paths: string[]) {
    super();
    this.paths = paths;
  }
  makeAnonymous() {
    const clone = this.clone();
    clone.paths = clone.paths.map(this.toHash);
    return clone;
  }
}

/** @flow */
import AbstractError from '../../../../error/abstract-error';

export default class NoFiles extends AbstractError {
  ignoredFiles: string[];

  constructor(ignoredFiles: string[]) {
    super();
    this.ignoredFiles = ignoredFiles;
  }
  makeAnonymous() {
    const clone = this.clone();
    clone.ignoredFiles = clone.ignoredFiles.map(this.toHash);
    return clone;
  }
}

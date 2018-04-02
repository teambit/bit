/** @flow */
import AbstractError from '../../../error/abstract-error';

export default class MissingMainFile extends AbstractError {
  mainFile: string;
  files: string[];

  constructor(mainFile: string, files: string[]) {
    super();
    this.mainFile = mainFile;
    this.files = files;
  }

  makeAnonymous() {
    const clone = this.clone();
    clone.mainFile = this.toHash(clone.mainFile);
    clone.files = clone.files.map(file => this.toHash(file));
    return clone;
  }
}

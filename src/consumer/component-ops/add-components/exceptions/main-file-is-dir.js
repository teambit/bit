/** @flow */
import AbstractError from '../../../../error/abstract-error';

export default class MainFileIsDir extends AbstractError {
  mainFile: string;
  constructor(mainFile: string) {
    super();
    this.mainFile = mainFile;
  }
  makeAnonymous() {
    const clone = this.clone();
    clone.mainFile = this.toHash(clone.mainFile);
    return clone;
  }
}

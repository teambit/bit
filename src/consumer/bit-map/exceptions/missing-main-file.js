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
}

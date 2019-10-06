import AbstractError from '../../../../error/abstract-error';

export default class NoFiles extends AbstractError {
  ignoredFiles: string[];

  constructor(ignoredFiles: string[]) {
    super();
    this.ignoredFiles = ignoredFiles;
  }
}

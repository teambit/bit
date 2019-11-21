import AbstractError from '../../../../error/abstract-error';

export default class ExcludedMainFile extends AbstractError {
  mainFile: string;
  constructor(mainFile: string) {
    super();
    this.mainFile = mainFile;
  }
}

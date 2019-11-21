import AbstractError from '../../../error/abstract-error';

export default class MainFileRemoved extends AbstractError {
  mainFile: string;
  id: string;
  constructor(mainFile: string, id: string) {
    super();
    this.mainFile = mainFile;
    this.id = id;
  }
}

import AbstractError from '../../../error/abstract-error';

export default class OutsideRootDir extends AbstractError {
  filePath: string;
  rootDir: string;

  constructor(filePath: string, rootDir: string) {
    super();
    this.filePath = filePath;
    this.rootDir = rootDir;
  }
}

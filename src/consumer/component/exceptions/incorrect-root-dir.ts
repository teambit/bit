import AbstractError from '../../../error/abstract-error';

export default class IncorrectRootDir extends AbstractError {
  id: string;
  importStatement: string;
  constructor(id: string, importStatement: string) {
    super();
    this.id = id;
    this.importStatement = importStatement;
  }
}

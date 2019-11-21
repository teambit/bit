import AbstractError from '../../../../error/abstract-error';

export default class IncorrectIdForImportedComponent extends AbstractError {
  importedId: string;
  newId: string;
  filePath: string;

  constructor(importedId: string, newId: string, filePath: string) {
    super();
    this.importedId = importedId;
    this.newId = newId;
    this.filePath = filePath;
  }
}

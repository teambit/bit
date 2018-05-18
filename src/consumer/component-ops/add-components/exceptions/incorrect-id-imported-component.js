/** @flow */
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
  makeAnonymous() {
    const clone = this.clone();
    clone.importedId = this.toHash(clone.importedId);
    clone.newId = this.toHash(clone.newId);
    clone.filePath = this.toHash(clone.filePath);
    return clone;
  }
}

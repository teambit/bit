/** @flow */
import AbstractError from '../../../../error/abstract-error';

export default class IncorrectIdForImportedComponent extends AbstractError {
  importedId: string;
  newId: string;

  constructor(importedId: string, newId: string) {
    super();
    this.importedId = importedId;
    this.newId = newId;
  }
  makeAnonymous() {
    const clone = this.clone();
    clone.importedId = this.toHash(clone.importedId);
    clone.newId = this.toHash(clone.newId);
    return clone;
  }
}

/** @flow */
export default class IncorrectIdForImportedComponent extends Error {
  importedId: string;
  newId: string;

  constructor(importedId: string, newId: string) {
    super();
    this.importedId = importedId;
    this.newId = newId;
  }
}

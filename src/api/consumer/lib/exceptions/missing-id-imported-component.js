/** @flow */
export default class MissingComponentIdForImportedComponent extends Error {
  id: string;

  constructor(id: string) {
    super();
    this.id = id;
  }
}

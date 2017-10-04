/** @flow */
export default class MissingFilesFromComponent extends Error {
  id: string;

  constructor(id: string) {
    super();
    this.id = id;
  }
}

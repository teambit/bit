/** @flow */
export default class InvalidIdOnCommit extends Error {
  id: string;

  constructor(id: string) {
    super();
    this.id = id;
  }
}

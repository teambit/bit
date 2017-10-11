/** @flow */
export default class NothingToCompareTo extends Error {
  id: string;

  constructor(id: string) {
    super();
    this.id = id;
  }
}

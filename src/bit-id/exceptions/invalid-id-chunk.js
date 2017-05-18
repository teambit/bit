/** @flow */
export default class InvalidIdChunk extends Error {
  id: string;

  constructor(id: string) {
    super();
    this.id = id;
  }
}

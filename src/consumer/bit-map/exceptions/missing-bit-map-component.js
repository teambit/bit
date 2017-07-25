/** @flow */
export default class MissingBitMapComponent extends Error {
  id: string;

  constructor(id: string) {
    super();
    this.id = id;
  }
}

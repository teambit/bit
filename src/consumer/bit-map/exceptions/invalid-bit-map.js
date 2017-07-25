/** @flow */
export default class InvalidBitMap extends Error {
  path: string;

  constructor(path: string) {
    super();
    this.path = path;
  }
}

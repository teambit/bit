/** @flow */
export default class InvalidBitLock extends Error {
  path: string;

  constructor(path: string) {
    super();
    this.path = path;
  }
}

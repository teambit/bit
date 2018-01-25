/** @flow */
export default class InvalidVersion extends Error {
  version: string;

  constructor(version: string) {
    super();
    this.version = version;
  }
}

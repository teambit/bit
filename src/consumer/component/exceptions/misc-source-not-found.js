/** @flow */
export default class MiscSourceNotFound extends Error {
  path: string;

  constructor(path: string) {
    super();
    this.path = path;
  }
}

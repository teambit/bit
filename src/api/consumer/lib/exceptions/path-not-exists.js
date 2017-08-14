/** @flow */
export default class PathNotExists extends Error {
  path: string;

  constructor(path: string) {
    super();
    this.path = path;
  }
}

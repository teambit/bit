/** @flow */
export default class PathsNotExist extends Error {
  path: string;
  constructor(path: string) {
    super();
    this.path = path;
    this.code = 'PathNotExist';
  }
}

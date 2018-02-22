/** @flow */
export default class PathsNotExist extends Error {
  paths: string[];
  constructor(paths: string[]) {
    super();
    this.paths = paths;
  }
}

/** @flow */
export default class FileSourceNotFound extends Error {
  path: string;

  constructor(path: string) {
    super();
    this.path = path;
  }
}

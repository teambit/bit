/** @flow */
// todo: is this needed? if so, change the error message in default-error-handler
export default class FileSourceNotFound extends Error {
  path: string;

  constructor(path: string) {
    super();
    this.path = path;
  }
}

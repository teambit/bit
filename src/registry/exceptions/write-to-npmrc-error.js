/** @flow */
export default class WriteToNpmrcError extends Error {
  path: string;
  constructor(path: string) {
    super();
    this.path = path;
    this.code = 'WriteError';
  }
}

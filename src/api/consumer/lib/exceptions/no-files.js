/** @flow */
export default class NoFiles extends Error {
  ignoredFiles: string[];

  constructor(ignoredFiles: string[]) {
    super();
    this.ignoredFiles = ignoredFiles;
  }
}

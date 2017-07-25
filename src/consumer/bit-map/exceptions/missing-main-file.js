/** @flow */
export default class MissingMainFile extends Error {
  mainFile: string;
  files: string[];

  constructor(mainFile: string, files: string[]) {
    super();
    this.mainFile = mainFile;
    this.files = files;
  }
}

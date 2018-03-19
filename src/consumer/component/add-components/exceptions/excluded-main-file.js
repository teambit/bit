/** @flow */
export default class ExcludedMainFile extends Error {
  mainFile: string;
  constructor(mainFile: string) {
    super();
    this.mainFile = mainFile;
  }
}

/** @flow */
export default class MissingImpl extends Error {
  implPath: string;

  constructor(implPath: string) {
    super();
    this.implPath = implPath;
  }
}

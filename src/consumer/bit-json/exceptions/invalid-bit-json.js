/** @flow */
export default class InvalidBitJson extends Error {
  path: string;
    
  constructor(path : string) {
    super();
    this.path = path;
  }
}

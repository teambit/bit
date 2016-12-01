/** @flow */
export default class BitAlreadyExistError extends Error {
  bitName: string;
    
  constructor(bitName : string) {
    super();
    this.bitName = bitName;
  }
}

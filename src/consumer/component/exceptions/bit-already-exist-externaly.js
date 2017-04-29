/** @flow */
export default class BitAlreadyExistExternalyError extends Error {
  bitName: string;

  constructor(bitName : string) {
    super();
    this.bitName = bitName;
  }
}

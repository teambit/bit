/** @flow */
export default class BitAlreadyExistInternalyError extends Error {
  bitName: string;
    
  constructor(bitName: string) {
    super();
    this.bitName = bitName;
  }
}

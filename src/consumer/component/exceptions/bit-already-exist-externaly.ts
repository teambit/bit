import AbstractError from '../../../error/abstract-error';

export default class BitAlreadyExistExternalyError extends AbstractError {
  bitName: string;

  constructor(bitName: string) {
    super();
    this.bitName = bitName;
  }
}

import AbstractError from '../../../error/abstract-error';

export default class OldClientVersion extends AbstractError {
  message: string;
  code: number;

  constructor(message: string) {
    super();
    this.code = 133;
    this.message = message;
  }
}

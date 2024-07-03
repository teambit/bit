import { BitError } from '@teambit/bit-error';

export default class GeneralError extends BitError {
  msg: string;

  constructor(msg: string) {
    super(msg);
    this.msg = msg;
  }
}

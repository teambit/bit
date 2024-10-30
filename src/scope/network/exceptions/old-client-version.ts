import { BitError } from '@teambit/bit-error';

export default class OldClientVersion extends BitError {
  message: string;
  code: number;

  constructor(message: string) {
    super();
    this.code = 133;
    this.message = message;
  }
}

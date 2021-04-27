import { BitError } from '@teambit/bit-error';

export class UnknownDepType extends BitError {
  constructor(readonly type: string) {
    super(`dependency of type ${type} is unknown`);
  }

  report() {
    return this.message;
  }
}

import { BitError } from 'bit-bin/dist/error/bit-error';

export class DependencyTypeNotSupportedInPolicy extends BitError {
  constructor(private type: string) {
    super(`the workspace policy does not support ${type} dependencies`);
  }

  report() {
    return this.message;
  }
}

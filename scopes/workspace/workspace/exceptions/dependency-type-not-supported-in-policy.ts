import { BitError } from 'bit-bin/dist/error/bit-error';

export class DependencyTypeNotSupportedInPolicy extends BitError {
  constructor(type: string) {
    super(`the workspace policy does not support ${type} dependencies`);
  }
}

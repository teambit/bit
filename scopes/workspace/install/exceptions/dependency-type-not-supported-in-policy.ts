import { BitError } from '@teambit/bit-error';

export class DependencyTypeNotSupportedInPolicy extends BitError {
  constructor(type: string) {
    super(`the workspace policy does not support ${type} dependencies`);
  }
}

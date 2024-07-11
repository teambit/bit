import { BitError } from '@teambit/bit-error';

export default class ExternalError extends BitError {
  originalError: Error;
  constructor(originalError: Error) {
    super();
    this.originalError = originalError;
  }
}

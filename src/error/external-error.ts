import AbstractError from './abstract-error';

export default class ExternalError extends AbstractError {
  originalError: Error;
  constructor(originalError: Error) {
    super();
    this.originalError = originalError;
  }
}

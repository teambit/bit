import AbstractError from './abstract-error';

/**
 * A class to represent multiple external errors
 */
export default class ExternalErrors extends AbstractError {
  originalErrors: Error[];
  constructor(originalErrors: Error[]) {
    super();
    this.originalErrors = originalErrors;
  }
}

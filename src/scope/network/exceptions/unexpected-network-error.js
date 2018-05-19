/** @flow */
import AbstractError from '../../../error/abstract-error';

export default class UnexpectedNetworkError extends AbstractError {
  message: string;
  constructor(message: string) {
    super();
    this.message = message;
  }
}

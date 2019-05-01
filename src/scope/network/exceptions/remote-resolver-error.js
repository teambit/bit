/** @flow */
import AbstractError from '../../../error/abstract-error';

export default class RemoteResolverError extends AbstractError {
  message: string;
  constructor(message: string) {
    super();
    this.message = message;
  }
}

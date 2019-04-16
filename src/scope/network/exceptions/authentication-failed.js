/** @flow */
import AbstractError from '../../../error/abstract-error';

export default class AuthenticationFailed extends AbstractError {
  debugInfo: string;

  constructor(debugInfo: string) {
    super();
    this.debugInfo = debugInfo;
  }
}

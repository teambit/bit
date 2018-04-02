/** @flow */
import AbstractError from '../../../error/abstract-error';

export default class NetworkError extends AbstractError {
  remoteErr: string;

  constructor(remoteErr: string) {
    super();
    this.remoteErr = remoteErr;
  }
}

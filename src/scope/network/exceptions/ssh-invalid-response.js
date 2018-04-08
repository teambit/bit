/** @flow */
import AbstractError from '../../../error/abstract-error';

export default class SSHInvalidResponse extends AbstractError {
  response: string;

  constructor(response: string) {
    super();
    this.response = response;
  }
}

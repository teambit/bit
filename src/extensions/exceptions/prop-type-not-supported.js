/** @flow */
import AbstractError from '../../error/abstract-error';

export default class PropTypeNotSupported extends AbstractError {
  type: string;

  constructor(type: string) {
    super();
    this.type = type;
  }
}

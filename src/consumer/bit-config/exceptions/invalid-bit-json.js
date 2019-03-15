/** @flow */
import AbstractError from '../../../error/abstract-error';

export default class InvalidBitJson extends AbstractError {
  path: string;

  constructor(path: string) {
    super();
    this.path = path;
  }
}

/** @flow */
import AbstractError from '../../error/abstract-error';

export default class VersionNotFound extends AbstractError {
  constructor(version: string) {
    super();
    this.version = version;
  }
}

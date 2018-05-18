/** @flow */
import AbstractError from '../../error/abstract-error';

export default class CorruptedComponent extends AbstractError {
  id: string;
  version: string;

  constructor(id: string, version: string) {
    super();
    this.id = id;
    this.version = version;
  }
}

/** @flow */
import AbstractError from '../../../../error/abstract-error';

export default class ObjectsWithoutConsumer extends AbstractError {
  scopePath: string;

  constructor(scopePath: string) {
    super();
    this.scopePath = scopePath;
  }
}

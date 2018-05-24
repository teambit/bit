/** @flow */
import AbstractError from '../../error/abstract-error';

export default class ComponentNotFound extends AbstractError {
  id: string;
  code: number;

  constructor(id: string) {
    super();
    this.code = 127;
    this.id = id;
  }
}

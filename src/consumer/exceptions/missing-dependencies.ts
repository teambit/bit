/** @flow */
import AbstractError from '../../error/abstract-error';

export default class MissingDependencies extends AbstractError {
  components: Object;
  constructor(components: Object) {
    super();
    this.components = components;
  }
}

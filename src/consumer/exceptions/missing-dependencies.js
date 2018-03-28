/** @flow */
import AbstractError from '../../error/abstract-error';

export default class MissingDependencies extends AbstractError {
  components: Object;

  constructor(components: Object) {
    super();
    this.components = components;
  }

  makeAnonymous() {
    const clone = this.clone();
    clone.components = this.toHash(JSON.stringify(clone.components));
    return clone;
  }
}

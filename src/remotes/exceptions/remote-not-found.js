import AbstractError from '../../error/abstract-error';

export default class RemoteNotFound extends AbstractError {
  constructor(name) {
    super();
    this.name = name;
  }
  makeAnonymous() {
    const clone = this.clone();
    clone.name = this.toHash(clone.name);
    return clone;
  }
}

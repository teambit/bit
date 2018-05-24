import AbstractError from '../../error/abstract-error';

export default class RemoteNotFound extends AbstractError {
  constructor(name) {
    super();
    this.name = name;
  }
}

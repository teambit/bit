import AbstractError from '../../error/abstract-error';

export default class InvalidScopeName extends AbstractError {
  scopeName: string;

  constructor(scopeName: string) {
    super();
    this.scopeName = scopeName;
  }
}

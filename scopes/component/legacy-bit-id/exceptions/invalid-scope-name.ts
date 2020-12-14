import AbstractError from '../../error/abstract-error';

export default class InvalidScopeName extends AbstractError {
  scopeName: string;
  id: string;

  constructor(scopeName: string, id: string) {
    super();
    this.scopeName = scopeName;
    this.id = id;
  }
}

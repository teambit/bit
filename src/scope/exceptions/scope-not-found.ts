import AbstractError from '../../error/abstract-error';

export default class ScopeNotFound extends AbstractError {
  scopePath: string;
  constructor(scopePath: string) {
    super();
    this.scopePath = scopePath;
  }
}

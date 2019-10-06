import AbstractError from '../../../error/abstract-error';

export default class PermissionDenied extends AbstractError {
  scope: string;

  constructor(scope: string) {
    super();
    this.scope = scope;
  }
}

import AbstractError from '../../error/abstract-error';

export default class InvalidVersion extends AbstractError {
  version: string | null | undefined;

  constructor(version: string | null | undefined) {
    super();
    this.version = version;
  }
}

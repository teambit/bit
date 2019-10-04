import AbstractError from '../../error/abstract-error';

export default class VersionNotFound extends AbstractError {
  version: string;
  constructor(version: string) {
    super();
    this.version = version;
  }
}

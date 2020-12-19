import AbstractError from '../../error/abstract-error';

export default class VersionNotFound extends AbstractError {
  constructor(public version: string, public componentId: string) {
    super();
  }
}

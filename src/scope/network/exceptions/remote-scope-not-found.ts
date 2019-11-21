import AbstractError from '../../../error/abstract-error';

export default class RemoteScopeNotFound extends AbstractError {
  name: string;
  code: number;

  constructor(name: string) {
    super();
    this.code = 129;
    this.name = name;
  }
}

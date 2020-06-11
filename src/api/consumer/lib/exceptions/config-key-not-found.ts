import AbstractError from '../../../../error/abstract-error';

export default class ConfigKeyNotFound extends AbstractError {
  key: string;

  constructor(key: string) {
    super();
    this.key = key;
  }
}

import AbstractError from '../../../error/abstract-error';

export default class InvalidConfigDir extends AbstractError {
  compId: string;

  constructor(compId: string) {
    super();
    this.compId = compId;
  }
}

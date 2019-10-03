import AbstractError from '../../../error/abstract-error';

export default class EjectNoDir extends AbstractError {
  compId: string;

  constructor(compId: string) {
    super();
    this.compId = compId;
  }
}

import AbstractError from '../../../error/abstract-error';

export default class InsightAlreadyExists extends AbstractError {
  insightName: string;

  constructor(insightName: string) {
    super();
    this.insightName = insightName;
  }
}

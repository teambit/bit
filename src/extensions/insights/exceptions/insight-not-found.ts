import AbstractError from '../../../error/abstract-error';

export default class InsightNotFound extends AbstractError {
  insightName: string;

  constructor(insightName: string) {
    super();
    this.insightName = insightName;
  }
}

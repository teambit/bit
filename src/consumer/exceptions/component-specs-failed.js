/** @flow */
import AbstractError from '../../error/abstract-error';

export default class ComponentSpecsFailed extends AbstractError {
  specsResultsAndIdPretty: string;

  constructor(specsResultsAndIdPretty: string) {
    super();
    this.specsResultsAndIdPretty = specsResultsAndIdPretty || '';
  }
}

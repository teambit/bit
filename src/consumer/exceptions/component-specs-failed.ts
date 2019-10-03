/** @flow */
import AbstractError from '../../error/abstract-error';
import SpecsResults from '../specs-results';

export default class ComponentSpecsFailed extends AbstractError {
  id: string | null | undefined;
  specsResults: SpecsResults | null | undefined;

  constructor(id: string | null | undefined, specsResults: SpecsResults | null | undefined) {
    super();
    this.id = id;
    this.specsResults = specsResults;
  }
}

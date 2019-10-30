import AbstractError from '../../error/abstract-error';
import SpecsResults from '../specs-results';

export default class ComponentSpecsFailed extends AbstractError {
  id?: string;
  specsResults?: SpecsResults;

  constructor(id?: string, specsResults?: SpecsResults) {
    super();
    this.id = id;
    this.specsResults = specsResults;
  }
}

// @flow
import ExternalError from '../../../error/external-error';

export default class ExternalTestError extends ExternalError {
  id: string;
  constructor(originalError: Error, id: string) {
    super(originalError);
    this.id = id;
  }
}

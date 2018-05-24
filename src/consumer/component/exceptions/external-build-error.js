// @flow
import ExternalError from '../../../error/external-error';

export default class ExternalBuildError extends ExternalError {
  id: string;
  constructor(originalError: Error, id: string) {
    super(originalError);
    this.id = id;
  }
}

/** @flow */
import ExternalError from '../../error/external-error';

export default class ResolutionException extends ExternalError {
  filePath: string;
  constructor(originalError: Error, filePath: string) {
    super(originalError);
    this.filePath = filePath;
  }
}

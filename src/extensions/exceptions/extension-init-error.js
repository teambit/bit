/** @flow */

import ExternalError from '../../error/external-error';

export default class ExtensionInitError extends ExternalError {
  compName: string;

  constructor(originalError: Error, compName: string) {
    super(originalError);
    this.compName = compName;
  }
}

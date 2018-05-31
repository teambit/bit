/** @flow */

import ExternalError from '../../error/external-error';

export default class ExtensionGetDynamicPackagesError extends ExternalError {
  name: string;

  constructor(originalError: Error, name: string) {
    super(originalError);
    this.name = name;
  }
}

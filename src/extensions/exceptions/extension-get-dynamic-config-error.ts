import ExternalError from '../../error/external-error';

export default class ExtensionGetDynamicConfigError extends ExternalError {
  compName: string;

  constructor(originalError: Error, compName: string) {
    super(originalError);
    this.compName = compName;
  }
}

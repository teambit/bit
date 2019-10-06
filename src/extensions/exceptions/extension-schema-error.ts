import AbstractError from '../../error/abstract-error';

export default class ExtensionSchemaError extends AbstractError {
  errors: string;
  extensionName: string;

  constructor(extensionName: string, errors: string) {
    super();
    this.extensionName = extensionName;
    this.errors = errors;
  }
}

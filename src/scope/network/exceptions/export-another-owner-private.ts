import AbstractError from '../../../error/abstract-error';

export default class ExportAnotherOwnerPrivate extends AbstractError {
  message: string;
  sourceScope: string;
  destinationScope: string;
  constructor(message: string, sourceScope: string, destinationScope: string) {
    super();
    this.message = message;
    this.sourceScope = sourceScope;
    this.destinationScope = destinationScope;
  }
}

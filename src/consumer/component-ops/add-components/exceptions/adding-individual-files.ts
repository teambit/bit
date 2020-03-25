import AbstractError from '../../../../error/abstract-error';

export class AddingIndividualFiles extends AbstractError {
  file: string;
  constructor(file: string) {
    super();
    this.file = file;
  }
}

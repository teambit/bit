import AbstractError from '../../../error/abstract-error';

export default class InvalidBitMap extends AbstractError {
  path: string;
  errorMessage: string;
  showDoctorMessage: boolean;

  constructor(path: string, errorMessage: string) {
    super();
    this.path = path;
    this.errorMessage = errorMessage;
    this.showDoctorMessage = true;
  }
}

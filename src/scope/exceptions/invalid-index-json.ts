import AbstractError from '../../error/abstract-error';

export default class InvalidIndexJson extends AbstractError {
  path: string;
  showDoctorMessage: boolean;

  constructor(path: string, message: string) {
    super();
    this.path = path;
    this.message = message;
    this.showDoctorMessage = true;
  }
}

import AbstractError from '../../../error/abstract-error';

export default class InvalidPackageJson extends AbstractError {
  path: string;
  showDoctorMessage: boolean;

  constructor(path: string) {
    super();
    this.path = path;
    this.showDoctorMessage = true;
  }
}

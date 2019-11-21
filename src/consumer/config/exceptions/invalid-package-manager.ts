import AbstractError from '../../../error/abstract-error';

export default class InvalidPackageManager extends AbstractError {
  packageManager: string;
  showDoctorMessage: boolean;

  constructor(packageManager: string) {
    super();
    this.packageManager = packageManager;
    this.showDoctorMessage = false;
  }
}

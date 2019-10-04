import AbstractError from '../../error/abstract-error';

export default class LoginFailed extends AbstractError {
  showDoctorMessage: boolean;

  constructor() {
    super();
    this.showDoctorMessage = true;
  }
}
